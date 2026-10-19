import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSpeechToText,
  buildTextToSpeech,
  describeSpeechSetup,
  envKey,
  FallbackSpeechToText,
  parseProviderList,
  SpeechError,
  type SpeechToText,
} from "@/lib/speech";
import { GeminiSpeechToText, TRANSCRIBE_PROMPT } from "@/lib/speech/gemini";
import { OpenAISpeechToText, OpenAITextToSpeech } from "@/lib/speech/openai";

const voiceNote = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg; codecs=opus" };

describe("speech providers (ADR-090)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("sends the recording inline to Gemini and returns only the words", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: " Ẹ káàárọ̀ \n" }] } }] }),
    );
    const stt = new GeminiSpeechToText("gem-key", "gemini-test", fetchMock);
    expect(await stt.transcribe(voiceNote)).toBe("Ẹ káàárọ̀");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("gem-key");
    const body = JSON.parse(String(init!.body));
    expect(body.contents[0].parts[0].text).toBe(TRANSCRIBE_PROMPT);
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: "audio/ogg",
      data: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("treats silence and failures as errors with a category", async () => {
    const empty = new GeminiSpeechToText(
      "k",
      "m",
      vi.fn<typeof fetch>(async () => Response.json({ candidates: [] })),
    );
    await expect(empty.transcribe(voiceNote)).rejects.toMatchObject({ category: "empty" });
    const down = new OpenAISpeechToText(
      "k",
      "m",
      vi.fn<typeof fetch>(async () => new Response("no", { status: 503 })),
    );
    await expect(down.transcribe(voiceNote)).rejects.toMatchObject({
      category: "provider",
      status: 503,
    });
    await expect(
      new OpenAISpeechToText("k").transcribe({ data: new Uint8Array([1]), mimeType: "image/png" }),
    ).rejects.toMatchObject({ category: "invalid_media" });
  });

  it("uploads the file to OpenAI's transcription endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ text: "Hello" }));
    expect(await new OpenAISpeechToText("sk-x", "whisper-1", fetchMock).transcribe(voiceNote)).toBe(
      "Hello",
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect((form.get("file") as File).name).toBe("voice.ogg");
  });

  it("speaks a reply as MP3 with OpenAI", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([7, 7])));
    const audio = await new OpenAITextToSpeech("sk-x", "tts-m", "alloy", fetchMock).synthesize(
      "Hi",
    );
    expect(audio).toEqual({ data: new Uint8Array([7, 7]), mimeType: "audio/mpeg" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({
      model: "tts-m",
      input: "Hi",
      response_format: "mp3",
    });
  });

  it("falls back to the next provider, but not after silence", async () => {
    const failing: SpeechToText = {
      name: "a",
      transcribe: async () => {
        throw new SpeechError("down", "provider", 500);
      },
    };
    const silent: SpeechToText = {
      name: "s",
      transcribe: async () => {
        throw new SpeechError("none", "empty");
      },
    };
    const working: SpeechToText = { name: "b", transcribe: async () => "words" };
    expect(await new FallbackSpeechToText([failing, working]).transcribe(voiceNote)).toBe("words");
    await expect(
      new FallbackSpeechToText([silent, working]).transcribe(voiceNote),
    ).rejects.toMatchObject({ category: "empty" });
    await expect(new FallbackSpeechToText([failing]).transcribe(voiceNote)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("builds the chain from configuration and the keys available; Claude cannot transcribe", async () => {
    expect(parseProviderList(undefined, ["gemini"])).toEqual(["gemini"]);
    expect(parseProviderList("OpenAI, nope, gemini, openai", [])).toEqual(["openai", "gemini"]);
    const keys = { gemini: "g", openai: "o", claude: "c" } as Record<string, string>;
    const keyFor = async (p: string) => keys[p] ?? null;

    const chain = await buildSpeechToText(keyFor, {
      SPEECH_TO_TEXT_PROVIDERS: "claude,openai,gemini",
    });
    expect(chain?.name).toBe("openai,gemini");
    expect(await buildSpeechToText(async () => null, {})).toBeNull();
    expect(await buildSpeechToText(keyFor, { SPEECH_TO_TEXT_PROVIDERS: "claude" })).toBeNull();

    expect((await buildTextToSpeech(keyFor, {}))?.name).toBe("openai");
    expect(await buildTextToSpeech(keyFor, { TEXT_TO_SPEECH_PROVIDER: "off" })).toBeNull();
    expect(await buildTextToSpeech(keyFor, { TEXT_TO_SPEECH_PROVIDER: "gemini" })).toBeNull();
    expect(await buildTextToSpeech(async () => null, {})).toBeNull();

    const setup = await describeSpeechSetup(async (p) => (p === "gemini" ? "g" : null), {});
    expect(setup.find((p) => p.name === "gemini")).toMatchObject({
      speechToTextPosition: 1,
      hasKey: true,
    });
    expect(setup.find((p) => p.name === "claude")).toMatchObject({
      speechToText: false,
      speechToTextPosition: null,
    });
  });

  it("reads keys from the environment", () => {
    expect(envKey("gemini", { GEMINI_API_KEY: " g " })).toBe("g");
    expect(envKey("claude", { ANTHROPIC_API_KEY: "a" })).toBe("a");
    expect(envKey("openai", {})).toBeNull();
  });
});
