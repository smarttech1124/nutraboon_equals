/**
 * Voice interfaces (CLAUDE.md §17, ADR-043). The browser implementations in
 * ./browser.ts use the Web Speech API; a server-side transcription service
 * could implement SpeechToText later without changing the chat, which only
 * ever receives text.
 */

export type SpeechErrorKind =
  "not-allowed" | "no-speech" | "network" | "aborted" | "language" | "other";

export interface SpeechToText {
  /**
   * Starts listening. Listening continues through short pauses and ends after
   * a longer silence, on stop(), or at a time limit (ADR-049). `onFinal` gets
   * the whole transcript once, after the speech has been fully processed.
   */
  start(handlers: {
    onInterim?: (text: string) => void;
    /** Capture has ended and the last words are being processed. */
    onProcessing?: () => void;
    onFinal: (text: string) => void;
    onError: (kind: SpeechErrorKind) => void;
    onEnd: () => void;
  }): void;
  stop(): void;
  /** BCP 47 tag, e.g. "en-NG" or "yo-NG". */
  lang?: string;
}

export interface TextToSpeech {
  speak(text: string, handlers?: { onEnd?: () => void }): void;
  cancel(): void;
  /** BCP 47 tag of the language to speak. */
  lang?: string;
  /** False when the device has no voice for `lang`, so nothing should be read. */
  canSpeak?(lang: string): boolean;
}
