"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/validation/limits";
import { cleanForSpeech } from "@/lib/voice/speech-text";
import type { useVoice } from "./useVoice";

type Props = {
  /** `viaVoice` is true when the text came from the microphone (ADR-043). */
  onSend: (text: string, viaVoice: boolean) => void;
  disabled?: boolean;
  voice?: ReturnType<typeof useVoice>;
  placeholder?: string;
  /**
   * Read a voice message back and accept a spoken "send" (ADR-057). The
   * message is still reviewed before it goes: by ear instead of by eye.
   */
  confirmByVoice?: boolean;
};

/** Grows the box with its text up to its CSS max-height, then scrolls inside it. */
function fitToContent(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const max = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
  el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
  el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(function ChatInput(
  { onSend, disabled, voice, placeholder = "Ask Nutraboom Equals…", confirmByVoice = false },
  ref,
) {
  const [value, setValue] = useState("");
  /** A voice transcript is in the box, waiting for the user to check and send. */
  const [voiceReady, setVoiceReady] = useState(false);
  /** The read-back ended without a "send": say so instead of "Ready". */
  const [notSent, setNotSent] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const viaVoice = useRef(false);
  useImperativeHandle(ref, () => textarea.current!, []);
  const canSend = !disabled && value.trim().length > 0 && !voice?.listening;

  useLayoutEffect(() => fitToContent(textarea.current), [value]);

  function sendText(text: string) {
    if (disabled || !text.trim()) return;
    onSend(text, viaVoice.current);
    viaVoice.current = false;
    setVoiceReady(false);
    setNotSent(false);
    setValue("");
  }

  function submit() {
    if (canSend) sendText(value);
  }

  /** "I heard: …. Say send to send it, or again to record it again." */
  async function confirmAloud(text: string, before: string) {
    if (!voice) return;
    await voice.speakPrompt(
      `I heard: ${cleanForSpeech(text)}. Say send to send it, or again to record it again.`,
    );
    voice.listenForCommand((command) => {
      if (command === "send") return sendText(text);
      if (command === "again") {
        setValue(before);
        return startVoice(before);
      }
      setNotSent(true); // silence, "cancel" or an unclear reply: nothing is sent
    });
  }

  function toggleListening() {
    if (!voice) return;
    if (voice.listening) {
      voice.stopListening();
      return;
    }
    startVoice(value);
  }

  function startVoice(before: string) {
    if (!voice) return;
    setVoiceReady(false);
    setNotSent(false);
    // The transcript is placed in the box for review, never sent automatically:
    // a misheard food or medicine should be caught before it shapes advice.
    voice.startListening((transcript) => {
      const text = before.trim() ? `${before.trim()} ${transcript}` : transcript;
      setValue(text);
      viaVoice.current = true;
      setVoiceReady(true);
      textarea.current?.focus();
      if (confirmByVoice && voice.outputSupported) void confirmAloud(text, before);
    });
  }

  const phase = voice?.phase ?? "idle";

  return (
    <div className="border-t border-line p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message Nutraboom Equals
        </label>
        <textarea
          id="chat-input"
          ref={textarea}
          rows={1}
          value={value}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => {
            setValue(e.target.value);
            if (!e.target.value.trim()) setVoiceReady(false);
            // Typing takes over from a spoken confirmation.
            if (voice?.phase === "confirming") voice.stopListening();
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="max-h-[40vh] min-h-11 flex-1 resize-none overflow-y-hidden rounded-xl border border-line bg-surface px-3 py-2.5 leading-6 text-ink placeholder:text-muted"
        />
        {voice?.inputSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled || phase === "processing"}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? "Stop voice input" : "Speak your message"}
            title="Voice input uses your browser's speech service"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
              voice.listening
                ? "border-danger bg-danger-soft text-danger"
                : "border-line text-ink hover:bg-subtle"
            }`}
          >
            <span aria-hidden="true">{voice.listening ? "■" : "🎤"}</span>
          </button>
        )}
        <button
          type="submit"
          disabled={!canSend}
          className="h-11 rounded-xl bg-brand px-4 font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>

      {phase === "listening" && (
        <p role="status" className="mt-2 text-sm text-muted">
          <span
            aria-hidden="true"
            className="mr-1 inline-block size-2 animate-pulse rounded-full bg-danger"
          />
          Listening…{voice?.interim ? ` “${voice.interim}”` : ""}{" "}
          <span className="text-xs">
            Pause for a few seconds or tap ■ when you finish. (Processed by your browser&apos;s
            speech service.)
          </span>
        </p>
      )}
      {phase === "processing" && (
        <p role="status" className="mt-2 text-sm text-muted">
          Processing your last words…
        </p>
      )}
      {phase === "confirming" && (
        <p role="status" className="mt-2 text-sm text-muted">
          Say “send” to send it, or “again” to record it again.
        </p>
      )}
      {phase === "idle" && voiceReady && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notSent ? "Not sent. " : "Ready. "}
          {/* Screen readers hear what was transcribed without moving to the box. */}
          <span className="sr-only">You said: “{value}”. </span>
          Check the text, then press Send.
        </p>
      )}
      {voice?.error && phase === "idle" && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {voice.error}
        </p>
      )}
      {voice?.speaking && (
        <button
          type="button"
          onClick={voice.stopSpeaking}
          className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-subtle"
        >
          <span aria-hidden="true">🔇 </span>Stop reading
        </button>
      )}
    </div>
  );
});
