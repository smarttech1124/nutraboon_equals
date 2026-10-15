import type { SpeechErrorKind, SpeechToText, TextToSpeech } from "./types";

/** Nigerian English first; browsers fall back when they lack it. */
export const SPEECH_LANG = "en-NG";

/**
 * Listening limits (ADR-049). Short pauses while someone thinks are normal,
 * so listening only ends after SILENCE_MS without new words.
 */
export type ListeningLimits = {
  silenceMs: number;
  noSpeechMs: number;
  maxMs: number;
  finishGraceMs: number;
  maxRestarts: number;
};

export const LISTENING: ListeningLimits = {
  /** Silence after speech that ends the recording. */
  silenceMs: 3_500,
  /** How long to wait for the first word. */
  noSpeechMs: 10_000,
  /** Hard limit for one recording. */
  maxMs: 120_000,
  /** If the browser does not report the end after stop(), finish anyway. */
  finishGraceMs: 3_000,
  /** Browsers end sessions on their own; restart up to this many times. */
  maxRestarts: 10,
};

/**
 * Listening for a one- or two-word reply ("send", "again") after a transcript
 * is read back (ADR-057): short silence, short wait, no restarts.
 */
export const COMMAND_LISTENING: ListeningLimits = {
  silenceMs: 1_200,
  noSpeechMs: 7_000,
  maxMs: 10_000,
  finishGraceMs: 1_500,
  maxRestarts: 0,
};

/** The parts of the Web Speech recognition API we use (not in TypeScript's DOM types). */
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSpeechInputSupported(): boolean {
  return recognitionConstructor() !== undefined;
}

export function isSpeechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function errorKind(error: string): SpeechErrorKind {
  if (error === "not-allowed" || error === "service-not-allowed") return "not-allowed";
  if (error === "no-speech") return "no-speech";
  if (error === "network") return "network";
  if (error === "aborted") return "aborted";
  if (error === "language-not-supported") return "language";
  return "other";
}

const join = (...parts: string[]) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");

type Handlers = Parameters<SpeechToText["start"]>[0];

/**
 * Speech-to-text through the browser (in Chrome, audio is processed by
 * Google). Listens continuously, ends on a longer silence rather than the
 * browser's first pause, restarts sessions the browser closes early, and
 * keeps the last unconfirmed words instead of dropping them (ADR-049).
 */
export class BrowserSpeechToText implements SpeechToText {
  lang = SPEECH_LANG;
  private recognition?: Recognition;
  private handlers?: Handlers;
  /** Text from finished sessions. */
  private collected = "";
  /** Text of the session still running; read if the browser never reports its end. */
  private sessionPending: () => string = () => "";
  private stopping = false;
  private fatal = false;
  private heardSpeech = false;
  private restarts = 0;
  private startedAt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private graceTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly limits: ListeningLimits = LISTENING) {}

  start(handlers: Handlers): void {
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      handlers.onError("other");
      handlers.onEnd();
      return;
    }
    this.handlers = handlers;
    this.collected = "";
    this.sessionPending = () => "";
    this.stopping = false;
    this.fatal = false;
    this.heardSpeech = false;
    this.restarts = 0;
    this.startedAt = Date.now();
    this.armTimer(this.limits.noSpeechMs);
    this.session(Ctor);
  }

  stop(): void {
    if (!this.recognition || this.stopping) return;
    this.stopping = true;
    this.clearTimers();
    this.handlers?.onProcessing?.();
    // Let the browser deliver its last words; finish anyway if it never says so.
    this.graceTimer = setTimeout(() => this.finish(), this.limits.finishGraceMs);
    this.recognition.stop();
  }

  private session(Ctor: RecognitionConstructor): void {
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    // Results by index: a continuous session resends earlier results.
    const finals = new Map<number, string>();
    let interim = "";
    const sessionText = () =>
      join(...[...finals.keys()].sort((a, b) => a - b).map((k) => finals.get(k)!));

    this.sessionPending = () => join(sessionText(), interim);

    recognition.onresult = (event) => {
      interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals.set(i, result[0].transcript);
        else interim = join(interim, result[0].transcript);
      }
      this.heardSpeech = true;
      if (!this.stopping) this.armTimer(this.limits.silenceMs);
      this.handlers?.onInterim?.(join(this.collected, sessionText(), interim));
    };
    recognition.onerror = (event) => {
      const kind = errorKind(event.error);
      // A silent gap only ends a browser session; our own timers decide when
      // listening is over and report no-speech.
      if (kind === "aborted" || kind === "no-speech") return;
      this.fatal = true;
      this.handlers?.onError(kind);
    };
    recognition.onend = () => {
      // Keep words the browser had not confirmed yet rather than lose them.
      this.collected = join(this.collected, sessionText(), interim);
      this.sessionPending = () => "";
      if (this.recognition !== recognition) return;
      const timeLeft = Date.now() - this.startedAt < this.limits.maxMs;
      if (!this.stopping && !this.fatal && timeLeft && this.restarts < this.limits.maxRestarts) {
        this.restarts++;
        this.session(Ctor);
        return;
      }
      this.finish();
    };
    this.recognition = recognition;
    recognition.start();
  }

  private armTimer(ms: number): void {
    clearTimeout(this.timer);
    const remaining = this.limits.maxMs - (Date.now() - this.startedAt);
    this.timer = setTimeout(
      () => {
        if (!this.heardSpeech) this.handlers?.onError("no-speech");
        this.stop();
      },
      Math.max(0, Math.min(ms, remaining)),
    );
  }

  private clearTimers(): void {
    clearTimeout(this.timer);
    clearTimeout(this.graceTimer);
  }

  private finish(): void {
    if (!this.handlers) return;
    const handlers = this.handlers;
    this.handlers = undefined;
    this.clearTimers();
    this.recognition = undefined;
    const text = join(this.collected, this.sessionPending());
    this.sessionPending = () => "";
    if (text) handlers.onFinal(text);
    handlers.onEnd();
  }
}

function voicesFor(lang: string): SpeechSynthesisVoice[] {
  if (!isSpeechOutputSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  return [
    ...voices.filter((v) => v.lang === lang),
    ...voices.filter((v) => v.lang !== lang && v.lang.split(/[-_]/)[0] === base),
  ];
}

/** Text-to-speech through the browser's built-in voices. */
export class BrowserTextToSpeech implements TextToSpeech {
  lang = SPEECH_LANG;

  /**
   * English always has a usable voice. Other languages (Yoruba, Igbo) are
   * only read when the device has a voice for them: an English voice reading
   * Yoruba would be unintelligible.
   */
  canSpeak(lang: string): boolean {
    if (!isSpeechOutputSupported()) return false;
    return lang.startsWith("en") || voicesFor(lang).length > 0;
  }

  speak(text: string, handlers?: { onEnd?: () => void }): void {
    if (!isSpeechOutputSupported() || !text.trim() || !this.canSpeak(this.lang)) {
      handlers?.onEnd?.();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel(); // never talk over an earlier reply
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    const voices = synth.getVoices();
    utterance.voice =
      voicesFor(this.lang)[0] ??
      (this.lang.startsWith("en")
        ? (voices.find((v) => v.lang.startsWith("en-GB")) ??
          voices.find((v) => v.lang.startsWith("en")))
        : undefined) ??
      null;
    utterance.onend = () => handlers?.onEnd?.();
    utterance.onerror = () => handlers?.onEnd?.();
    synth.speak(utterance);
  }

  cancel(): void {
    if (isSpeechOutputSupported()) window.speechSynthesis.cancel();
  }
}
