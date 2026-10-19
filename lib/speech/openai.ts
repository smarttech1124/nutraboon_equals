import {
  baseMimeType,
  SpeechError,
  type Audio,
  type SpeechToText,
  type TextToSpeech,
} from "./types";

/**
 * OpenAI speech (ADR-090): transcription (POST /v1/audio/transcriptions) and
 * text to speech (POST /v1/audio/speech, MP3, which WhatsApp plays as audio).
 * https://platform.openai.com/docs/guides/speech-to-text
 * https://platform.openai.com/docs/guides/text-to-speech
 */

const BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_TTS_VOICE = "alloy";
/** The transcription endpoint's upload limit. */
export const OPENAI_MAX_BYTES = 25 * 1024 * 1024;
/** The speech endpoint's input limit, in characters. */
export const TTS_MAX_CHARS = 4096;

const EXTENSION: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "video/mp4": "mp4",
};

const TIMEOUT_MS = 30_000;

export class OpenAISpeechToText implements SpeechToText {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_TRANSCRIBE_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Audio): Promise<string> {
    const mimeType = baseMimeType(audio.mimeType);
    const extension = EXTENSION[mimeType];
    if (!extension) throw new SpeechError(`OpenAI does not accept ${mimeType}`, "invalid_media");
    if (audio.data.byteLength > OPENAI_MAX_BYTES) {
      throw new SpeechError("Recording too large for OpenAI", "invalid_media");
    }
    const form = new FormData();
    form.append("model", this.model);
    form.append("response_format", "json");
    form.append(
      "file",
      new Blob([new Uint8Array(audio.data)], { type: mimeType }),
      `voice.${extension}`,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SpeechError("OpenAI transcription request failed", "provider");
    }
    if (!response.ok) {
      throw new SpeechError("OpenAI transcription failed", "provider", response.status);
    }
    const body = (await response.json().catch(() => null)) as { text?: string } | null;
    const text = body?.text?.trim();
    if (!text) throw new SpeechError("No speech found", "empty");
    return text;
  }
}

export class OpenAITextToSpeech implements TextToSpeech {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_TTS_MODEL,
    private readonly voice: string = DEFAULT_TTS_VOICE,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async synthesize(text: string): Promise<Audio> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE_URL}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          voice: this.voice,
          input: text.slice(0, TTS_MAX_CHARS),
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SpeechError("OpenAI speech request failed", "provider");
    }
    if (!response.ok) throw new SpeechError("OpenAI speech failed", "provider", response.status);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0) throw new SpeechError("OpenAI returned no audio", "provider");
    return { data, mimeType: "audio/mpeg" };
  }
}
