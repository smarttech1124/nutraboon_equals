/**
 * Voice stand-in for the demo recording (docs/DEMO_README.md, "Voice").
 *
 * Browsers do not return speech-recognition results under automation, and a
 * recording has no microphone, so the recorder cannot speak to the app. This
 * script, injected only into the recording browser (never into the app),
 * replaces the browser's SpeechRecognition with a stand-in that "hears" the
 * sentence the recorder sets in window.__demoVoice, word by word, like real
 * recognition. Everything after that is the app's real voice flow: the
 * listening state, the transcript placed in the box for review, the send, and
 * the reply read aloud with the browser's real speech synthesis.
 *
 * It also notes when the app speaks (window.__demoSpoken), so the polished
 * video can add the same words as sound: a screen recording is silent.
 *
 * Plain JavaScript, loaded with addInitScript({ path }).
 */
(() => {
  const w = window;
  if (w.__demoVoiceInstalled) return;
  w.__demoVoiceInstalled = true;
  w.__demoSpoken = [];

  class StandInRecognition {
    constructor() {
      this.lang = "en-NG";
      this.interimResults = true;
      this.continuous = true;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onstart = null;
      this._timers = [];
      this._ended = false;
    }

    start() {
      const sentence = (w.__demoVoice || "").trim();
      // Each sentence is heard once; later sessions hear silence.
      w.__demoVoice = "";
      this._ended = false;
      this._later(() => this.onstart && this.onstart(new Event("start")), 50);
      if (!sentence) {
        this._later(() => this.onerror && this.onerror({ error: "no-speech" }), 4000);
        this._later(() => this._end(), 4100);
        return;
      }
      const words = sentence.split(/\s+/);
      const step = 330;
      words.forEach((_, i) => {
        this._later(
          () => {
            const final = i === words.length - 1;
            const text = words.slice(0, i + 1).join(" ");
            const result = { 0: { transcript: text, confidence: 0.95 }, length: 1, isFinal: final };
            if (this.onresult) this.onresult({ resultIndex: 0, results: { 0: result, length: 1 } });
          },
          900 + i * step,
        );
      });
    }

    stop() {
      this._later(() => this._end(), 150);
    }

    abort() {
      this._clear();
      this._end();
    }

    _end() {
      if (this._ended) return;
      this._ended = true;
      this._clear();
      if (this.onend) this.onend(new Event("end"));
    }

    _later(fn, ms) {
      this._timers.push(setTimeout(fn, ms));
    }

    _clear() {
      this._timers.forEach(clearTimeout);
      this._timers = [];
    }

    addEventListener() {}
    removeEventListener() {}
  }

  w.SpeechRecognition = StandInRecognition;
  w.webkitSpeechRecognition = StandInRecognition;

  // Note each utterance the app speaks (the real synthesis still plays).
  if (w.speechSynthesis) {
    const speak = w.speechSynthesis.speak.bind(w.speechSynthesis);
    w.speechSynthesis.speak = (utterance) => {
      w.__demoSpoken.push({ at: Date.now(), text: utterance.text, lang: utterance.lang });
      return speak(utterance);
    };
  }
})();
