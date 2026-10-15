"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";
import { BrowserSpeechToText, isSpeechInputSupported } from "@/lib/voice/browser";

export type SendState = { status: "idle" | "success" | "error"; message: string };

const noSubscribe = () => () => {};

/**
 * A message box for accessibility conversations (ADR-068). Patients may speak
 * instead of typing; the transcript lands in the box so they can check it
 * before sending, and the message is marked as spoken.
 */
export function MessageComposer({
  id,
  label,
  sendAction,
  onSent,
  allowSpeech,
  submitLabel = "Send",
  children,
}: {
  id: string;
  label: string;
  sendAction: (prev: SendState, formData: FormData) => Promise<SendState>;
  onSent?: () => void;
  allowSpeech: boolean;
  submitLabel?: string;
  /** Extra hidden fields. */
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const stt = useRef<BrowserSpeechToText | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: SendState, formData: FormData) => {
      const result = await sendAction(prev, formData);
      if (result.status === "success") {
        setDraft("");
        setInputMode("text");
        onSent?.();
      }
      return result;
    },
    { status: "idle", message: "" } as SendState,
  );

  // False on the server and in the first render, so the markup matches.
  const speechIn = useSyncExternalStore(noSubscribe, isSpeechInputSupported, () => false);
  const canSpeak = allowSpeech && speechIn;

  function listen() {
    setVoiceError(null);
    stt.current ??= new BrowserSpeechToText();
    setListening(true);
    stt.current.start({
      onFinal: (text) => {
        setDraft((d) => (d ? `${d} ${text}` : text));
        setInputMode("voice");
      },
      onError: (kind) =>
        setVoiceError(
          kind === "not-allowed"
            ? "Microphone access was blocked. Allow it in your browser settings, or type instead."
            : "We could not hear that. Please try again or type your message.",
        ),
      onEnd: () => setListening(false),
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {children}
      <input type="hidden" name="inputMode" value={inputMode} />
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        name="text"
        rows={3}
        maxLength={2000}
        required
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={pending}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-lg text-ink"
      />
      {inputMode === "voice" && (
        <p className="text-sm text-muted">Check the text of what you said before sending.</p>
      )}
      {voiceError && <Alert tone="error">{voiceError}</Alert>}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !draft.trim()}>
          {pending ? "Sending…" : submitLabel}
        </Button>
        {canSpeak && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => (listening ? stt.current?.stop() : listen())}
            aria-pressed={listening}
          >
            {listening ? "Stop listening" : "Speak instead"}
          </Button>
        )}
      </div>
    </form>
  );
}
