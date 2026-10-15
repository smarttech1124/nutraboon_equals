"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui";
import { BrowserTextToSpeech, isSpeechOutputSupported } from "@/lib/voice/browser";
import { SignLanguageResponseSlot } from "@/components/sign/SignLanguageResponse";
import { SignResponseToggle, useSignLanguageResponses } from "@/components/sign/SignResponseToggle";
import { MessageComposer, type SendState } from "./composer";

/**
 * The accessibility conversation (ADR-068), for the patient and for hospital
 * staff. New messages arrive by polling every few seconds. Patients can
 * speak (the transcript is shown for review before sending) and have replies
 * read aloud; everything is also plain text for screen readers.
 */

export type ConversationMessage = {
  id: string;
  sender: string;
  text: string;
  inputMode: string;
  createdAt: string;
};

const POLL_MS = 5_000;

const noSubscribe = () => () => {};

const SENDER_LABEL: Record<string, Record<string, string>> = {
  patient: { patient: "You", agent: "Nutraboom Equals assistant", staff: "Hospital staff" },
  staff: { patient: "Patient", agent: "Nutraboom Equals assistant", staff: "Hospital staff" },
};

export function AccessConversationView({
  conversationId,
  initialMessages,
  initialStatus,
  viewer,
  sendAction,
}: {
  conversationId: string;
  initialMessages: ConversationMessage[];
  initialStatus: string;
  viewer: "patient" | "staff";
  sendAction: (prev: SendState, formData: FormData) => Promise<SendState>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const tts = useRef<BrowserTextToSpeech | null>(null);
  const endRef = useRef<HTMLLIElement>(null);
  /** The newest message time seen, so each poll asks only for newer ones. */
  const lastSeen = useRef(initialMessages.at(-1)?.createdAt);

  const refresh = useCallback(async () => {
    const last = lastSeen.current;
    try {
      const res = await fetch(
        `/api/access-conversations/${conversationId}${last ? `?after=${encodeURIComponent(last)}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { status: string; messages: ConversationMessage[] };
      setStatus(body.status);
      if (body.messages.length > 0) {
        lastSeen.current = body.messages.at(-1)!.createdAt;
        setMessages((current) => {
          const known = new Set(current.map((m) => m.id));
          return [...current, ...body.messages.filter((m) => !known.has(m.id))];
        });
      }
    } catch {
      // Offline for a moment: the next poll tries again.
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function readAloud(text: string) {
    tts.current ??= new BrowserTextToSpeech();
    tts.current.speak(text);
  }

  // False on the server and in the first render, so the markup matches.
  const speechOut = useSyncExternalStore(noSubscribe, isSpeechOutputSupported, () => false);
  const canListen = viewer === "patient" && speechOut;
  // Sign-language responses are for the patient's side only (ADR-077).
  const signLanguage = useSignLanguageResponses() && viewer === "patient";
  const latestReply = messages.findLast((m) => m.sender !== viewer)?.id;

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3">
        {messages.map((m) => {
          const mine = m.sender === viewer;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  mine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-subtle text-ink"
                }`}
              >
                <p className="text-xs font-semibold opacity-80">
                  {SENDER_LABEL[viewer][m.sender] ?? m.sender}
                  {m.inputMode === "voice" ? " · spoken" : ""}
                </p>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {!mine && signLanguage && m.text.trim() && (
                  <SignLanguageResponseSlot
                    text={m.text}
                    module="hospital"
                    latest={m.id === latestReply}
                  />
                )}
                {!mine && canListen && (
                  <button
                    type="button"
                    onClick={() => readAloud(m.text)}
                    className="mt-1 text-sm font-semibold underline underline-offset-2"
                  >
                    Read aloud
                  </button>
                )}
              </div>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {status === "closed" ? (
        <Alert tone="info">
          This conversation is closed. It will be deleted 90 days after closing.
        </Alert>
      ) : (
        <>
          {viewer === "patient" && (
            <div className="flex justify-end">
              <SignResponseToggle id="hospital-sign-response" />
            </div>
          )}
          <MessageComposer
            id="text"
            label={viewer === "patient" ? "Your message" : "Your reply to the patient"}
            sendAction={sendAction}
            onSent={() => void refresh()}
            allowSpeech={viewer === "patient"}
          />
        </>
      )}
    </div>
  );
}
