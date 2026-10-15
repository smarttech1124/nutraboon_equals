// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserSpeechToText,
  BrowserTextToSpeech,
  isSpeechInputSupported,
  LISTENING,
  SPEECH_LANG,
} from "@/lib/voice/browser";
import { cleanForSpeech, nairaForSpeech, speechForReply } from "@/lib/voice/speech-text";

describe("speech text", () => {
  it("reads naira amounts as words", () => {
    expect(nairaForSpeech("I have ₦2,000 and ₦1.5k")).toBe(
      "I have 2,000 naira and 1.5 thousand naira",
    );
  });

  it("drops bullets and emoji, and joins lines into sentences", () => {
    expect(cleanForSpeech("Try these:\n- Rice and beans\n- 🛡️ Garri")).toBe(
      "Try these: Rice and beans. Garri",
    );
  });

  it("reads the urgent notice first, then the reply and notices", () => {
    expect(
      speechForReply({
        message: "Give nothing by mouth.",
        urgentNotice: "Go to the nearest hospital now, or call 112.",
        allergyNotice: "Leaving out peanut.",
        safetyNotice: "A child welfare clinic can advise you.",
      }),
    ).toBe(
      "Go to the nearest hospital now, or call 112. Give nothing by mouth. Leaving out peanut. A child welfare clinic can advise you.",
    );
  });
});

/** A fake of the browser recognition object; tests drive it by hand. */
class FakeRecognition {
  static last: FakeRecognition;
  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  end() {
    this.onend?.();
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  abort = vi.fn();
  constructor() {
    FakeRecognition.last = this;
  }
  say(text: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  }
}

describe("BrowserSpeechToText", () => {
  const install = () =>
    ((window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition);
  const handlers = () => ({
    onInterim: vi.fn(),
    onProcessing: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it("is unsupported without the Web Speech API", () => {
    expect(isSpeechInputSupported()).toBe(false);
  });

  it("listens continuously in Nigerian English and reports interim text", () => {
    install();
    expect(isSpeechInputSupported()).toBe(true);
    const h = handlers();
    new BrowserSpeechToText().start(h);
    const rec = FakeRecognition.last;
    expect(rec.lang).toBe(SPEECH_LANG);
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(true);

    rec.say("what can I", false);
    expect(h.onInterim).toHaveBeenCalledWith("what can I");
    rec.say("what can I cook with garri", true);
    rec.stop();
    expect(h.onProcessing).not.toHaveBeenCalled(); // the browser stopped, not us
  });

  it("keeps listening through a short pause and ends after a longer silence", () => {
    vi.useFakeTimers();
    install();
    const h = handlers();
    new BrowserSpeechToText().start(h);
    const rec = FakeRecognition.last;

    rec.say("I have two thousand naira", true);
    vi.advanceTimersByTime(LISTENING.silenceMs - 500);
    expect(h.onFinal).not.toHaveBeenCalled();
    rec.say("what can I cook", false); // speaking again resets the silence timer
    vi.advanceTimersByTime(LISTENING.silenceMs - 500);
    expect(h.onFinal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(h.onProcessing).toHaveBeenCalledOnce();
    expect(rec.stop).toHaveBeenCalled();
    // Words the browser had not confirmed yet are kept, not dropped.
    expect(h.onFinal).toHaveBeenCalledWith("I have two thousand naira what can I cook");
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("restarts when the browser ends a session early, keeping what was said", () => {
    vi.useFakeTimers();
    install();
    const h = handlers();
    new BrowserSpeechToText().start(h);
    const first = FakeRecognition.last;
    first.say("plan meals for my family", true);
    first.end(); // the browser gives up on its own

    const second = FakeRecognition.last;
    expect(second).not.toBe(first);
    expect(second.start).toHaveBeenCalled();
    expect(h.onEnd).not.toHaveBeenCalled();
    second.say("of four", true);
    expect(h.onInterim).toHaveBeenLastCalledWith("plan meals for my family of four");

    vi.advanceTimersByTime(LISTENING.silenceMs);
    expect(h.onFinal).toHaveBeenCalledWith("plan meals for my family of four");
  });

  it("finishes on the user's stop, after the browser delivers its last words", () => {
    install();
    const h = handlers();
    const stt = new BrowserSpeechToText();
    stt.start(h);
    const rec = FakeRecognition.last;
    rec.stop = vi.fn(); // the real browser reports the end a moment later
    rec.say("long question about beans", false);

    stt.stop();
    expect(h.onProcessing).toHaveBeenCalledOnce();
    expect(h.onFinal).not.toHaveBeenCalled();
    rec.say("long question about beans and rice", true);
    rec.end();
    expect(h.onFinal).toHaveBeenCalledWith("long question about beans and rice");
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("finishes anyway if the browser never reports the end", () => {
    vi.useFakeTimers();
    install();
    const h = handlers();
    const stt = new BrowserSpeechToText();
    stt.start(h);
    FakeRecognition.last.stop = vi.fn();
    FakeRecognition.last.say("hello", true);
    stt.stop();
    vi.advanceTimersByTime(LISTENING.finishGraceMs);
    expect(h.onFinal).toHaveBeenCalledWith("hello");
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("reports no-speech when nothing is said", () => {
    vi.useFakeTimers();
    install();
    const h = handlers();
    new BrowserSpeechToText().start(h);
    FakeRecognition.last.fail("no-speech"); // the browser's own report is ignored
    expect(h.onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LISTENING.noSpeechMs);
    expect(h.onError).toHaveBeenCalledWith("no-speech");
    expect(h.onFinal).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("stops at the time limit", () => {
    vi.useFakeTimers();
    install();
    const h = handlers();
    new BrowserSpeechToText().start(h);
    for (let t = 0; t < LISTENING.maxMs; t += 2_000) {
      FakeRecognition.last.say(`word ${t}`, false);
      vi.advanceTimersByTime(2_000);
    }
    expect(h.onFinal).toHaveBeenCalledOnce();
  });

  it("maps a blocked microphone to not-allowed and does not restart", () => {
    install();
    const h = handlers();
    new BrowserSpeechToText().start(h);
    const rec = FakeRecognition.last;
    rec.fail("not-allowed");
    rec.end();
    expect(FakeRecognition.last).toBe(rec);
    expect(h.onError).toHaveBeenCalledWith("not-allowed");
    expect(h.onFinal).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("listens in the chosen language and reports an unsupported one", () => {
    install();
    const h = handlers();
    const stt = new BrowserSpeechToText();
    stt.lang = "yo-NG";
    stt.start(h);
    expect(FakeRecognition.last.lang).toBe("yo-NG");
    FakeRecognition.last.fail("language-not-supported");
    expect(h.onError).toHaveBeenCalledWith("language");
  });
});

describe("BrowserTextToSpeech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
  });

  it("cancels anything playing, then speaks with a Nigerian English voice when available", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    (window as unknown as Record<string, unknown>).speechSynthesis = {
      speak,
      cancel,
      getVoices: () => [
        { lang: "en-US", name: "US" },
        { lang: "en-NG", name: "Nigeria" },
      ],
    };
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

    const onEnd = vi.fn();
    new BrowserTextToSpeech().speak("Hello", { onEnd });
    expect(cancel).toHaveBeenCalledBefore(speak);
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe("Hello");
    expect(utterance.voice).toMatchObject({ lang: "en-NG" });
    utterance.onend();
    expect(onEnd).toHaveBeenCalled();
  });

  it("does nothing, but still finishes, where speech output is unsupported", () => {
    const onEnd = vi.fn();
    new BrowserTextToSpeech().speak("Hello", { onEnd });
    expect(onEnd).toHaveBeenCalled();
  });
});
