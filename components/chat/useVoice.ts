"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LANGUAGE, type LanguageCode } from "@/lib/i18n/languages";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice/commands";
import {
  BrowserSpeechToText,
  COMMAND_LISTENING,
  BrowserTextToSpeech,
  isSpeechInputSupported,
  isSpeechOutputSupported,
} from "@/lib/voice/browser";
import type { SpeechErrorKind, SpeechToText, TextToSpeech } from "@/lib/voice/types";

export const VOICE_ERRORS: Record<Exclude<SpeechErrorKind, "aborted">, string> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser settings, or type your message.",
  "no-speech": "I didn't hear anything. Tap the microphone and try again.",
  network: "Voice input needs an internet connection. You can type your message instead.",
  language:
    "Your browser can't recognise speech in this language yet. Please type your message, or switch language in Settings.",
  other: "Voice input isn't working right now. Please type your message.",
};

export type VoiceEngines = {
  stt?: SpeechToText;
  tts?: TextToSpeech;
  /** Short listening for a spoken "send" or "again" (ADR-057). */
  commands?: SpeechToText;
};

/**
 * idle → listening (capturing) → processing (last words) → idle, and
 * confirming: waiting for a spoken "send" or "again" after a read-back.
 */
export type VoicePhase = "idle" | "listening" | "processing" | "confirming";

/**
 * Microphone and read-aloud state for the chat (ADR-043, ADR-049). Engines
 * can be injected for tests or a future server-side service; by default the
 * browser's Web Speech API is used when available.
 */
export function useVoice(engines: VoiceEngines = {}, language: LanguageCode = DEFAULT_LANGUAGE) {
  const [inputSupported, setInputSupported] = useState(false);
  const [outputSupported, setOutputSupported] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [interim, setInterim] = useState("");
  /** The reply being read aloud, if any, and the language it was read in. */
  const [speaking, setSpeaking] = useState<{ id: string; language: LanguageCode }>();
  // A reading in a previous language was cancelled when the language changed.
  const speakingId = speaking?.language === language ? speaking.id : undefined;
  const setSpeakingId = useCallback(
    (id: string | undefined) => setSpeaking(id ? { id, language } : undefined),
    [language],
  );
  /** Each playback gets a token so a cancelled one cannot clear its successor. */
  const playback = useRef(0);
  const [error, setError] = useState<string>();

  const stt = useRef<SpeechToText | undefined>(engines.stt);
  const tts = useRef<TextToSpeech | undefined>(engines.tts);
  const commands = useRef<SpeechToText | undefined>(engines.commands);

  // Detected after mount so server and client render the same markup.
  useEffect(() => {
    if (!stt.current && isSpeechInputSupported()) stt.current = new BrowserSpeechToText();
    if (!tts.current && isSpeechOutputSupported()) tts.current = new BrowserTextToSpeech();
    if (!commands.current && isSpeechInputSupported()) {
      commands.current = new BrowserSpeechToText(COMMAND_LISTENING);
    }
    setInputSupported(Boolean(stt.current));
  }, []);

  // Follow the chosen language. Reading aloud is offered only where the
  // device has a voice for it (Yoruba and Igbo voices are rare).
  useEffect(() => {
    if (stt.current) stt.current.lang = language;
    if (commands.current) commands.current.lang = language;
    if (tts.current) {
      tts.current.lang = language;
      tts.current.cancel();
    }
    playback.current++;
    const canSpeak = () =>
      setOutputSupported(Boolean(tts.current && (tts.current.canSpeak?.(language) ?? true)));
    canSpeak();
    // Browsers load voices asynchronously.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", canSpeak);
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", canSpeak);
    }
  }, [language]);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!stt.current) return;
      tts.current?.cancel(); // don't transcribe our own voice
      playback.current++;
      setSpeakingId(undefined);
      setError(undefined);
      setInterim("");
      setPhase("listening");
      stt.current.start({
        onInterim: setInterim,
        onProcessing: () => setPhase("processing"),
        onFinal: onTranscript,
        onError: (kind) => {
          if (kind !== "aborted") setError(VOICE_ERRORS[kind]);
        },
        onEnd: () => {
          setPhase("idle");
          setInterim("");
        },
      });
    },
    [setSpeakingId],
  );

  const stopListening = useCallback(() => {
    stt.current?.stop();
    commands.current?.stop();
  }, []);

  /**
   * Reads a prompt aloud (the read-back of a voice message) and resolves when
   * it ends. Separate from replies: it never shows a Listen/Stop state.
   */
  const speakPrompt = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!tts.current || !text) return resolve();
        playback.current++;
        setSpeakingId(undefined);
        tts.current.speak(text, { onEnd: () => resolve() });
      }),
    [setSpeakingId],
  );

  /** Listens briefly for "send", "again" or "cancel"; anything else is undefined. */
  const listenForCommand = useCallback((onCommand: (command: VoiceCommand | undefined) => void) => {
    if (!commands.current) return onCommand(undefined);
    let heard = "";
    setError(undefined);
    setPhase("confirming");
    commands.current.start({
      onFinal: (text) => (heard = text),
      // Silence or an unclear reply just leaves the message unsent.
      onError: () => {},
      onEnd: () => {
        setPhase("idle");
        onCommand(parseVoiceCommand(heard));
      },
    });
  }, []);

  /** Reads `text` aloud for the reply `id`, replacing anything already playing. */
  const speak = useCallback(
    (text: string, id: string) => {
      if (!tts.current || !text) return;
      const token = ++playback.current;
      setSpeakingId(id);
      tts.current.speak(text, {
        onEnd: () => {
          if (playback.current === token) setSpeakingId(undefined);
        },
      });
    },
    [setSpeakingId],
  );

  const stopSpeaking = useCallback(() => {
    playback.current++;
    tts.current?.cancel();
    setSpeakingId(undefined);
  }, [setSpeakingId]);

  // Never keep listening or talking after the chat goes away.
  useEffect(
    () => () => {
      stt.current?.stop();
      commands.current?.stop();
      tts.current?.cancel();
    },
    [],
  );

  return {
    inputSupported,
    outputSupported,
    phase,
    /** True while capturing or processing: the microphone button shows Stop. */
    listening: phase !== "idle",
    interim,
    speaking: speakingId !== undefined,
    speakingId,
    error,
    clearError: () => setError(undefined),
    startListening,
    stopListening,
    speakPrompt,
    listenForCommand,
    speak,
    stopSpeaking,
  };
}
