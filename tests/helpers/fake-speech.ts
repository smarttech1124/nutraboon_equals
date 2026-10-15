import { vi } from "vitest";

/** Fake browser speech recognition; tests drive it with say() and end(). */
export class FakeRecognition {
  static last: FakeRecognition | undefined;
  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.end());
  abort = vi.fn();
  constructor() {
    FakeRecognition.last = this;
  }
  say(text: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  end() {
    this.onend?.();
  }
}

type Utterance = { text: string; onend: (() => void) | null };

/** Installs fake speech input and output on window; returns the output spy. */
export function installFakeSpeech() {
  const spoken: Utterance[] = [];
  const synth = {
    speak: vi.fn((u: Utterance) => spoken.push(u)),
    cancel: vi.fn(),
    getVoices: () => [],
  };
  const w = window as unknown as Record<string, unknown>;
  w.webkitSpeechRecognition = FakeRecognition;
  w.speechSynthesis = synth;
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
  return { synth, spoken };
}

export function uninstallFakeSpeech() {
  const w = window as unknown as Record<string, unknown>;
  delete w.webkitSpeechRecognition;
  delete w.speechSynthesis;
  FakeRecognition.last = undefined;
}
