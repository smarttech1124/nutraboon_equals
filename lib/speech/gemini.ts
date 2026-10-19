import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { baseMimeType, SpeechError, type Audio, type SpeechToText } from "./types";

/**
 * Speech to text with Gemini (ADR-090): the recording is sent inline with an
 * instruction to write down exactly what was said. Gemini accepts audio and
 * video, so the speech in a video works too.
 * https://ai.google.dev/gemini-api/docs/audio
 */

/** Gemini's inline request limit is 20 MB, and base64 adds a third. */
export const GEMINI_INLINE_MAX_BYTES = 14 * 1024 * 1024;

const ACCEPTED = new Set([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/flac",
  "audio/amr",
  "video/mp4",
  "video/3gpp",
]);

export const TRANSCRIBE_PROMPT = [
  "Write down exactly what is said in this recording, in the language it is spoken in",
  "(likely Nigerian English, Pidgin, Yorùbá, Igbo or Hausa), with Yorùbá and Igbo tone marks where you hear them.",
  "Return only the words spoken: no description, translation, labels or quotation marks.",
  "If nobody speaks, return nothing.",
].join(" ");

const TIMEOUT_MS = 30_000;

export class GeminiSpeechToText implements SpeechToText {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Audio): Promise<string> {
    const mimeType = baseMimeType(audio.mimeType);
    if (!ACCEPTED.has(mimeType)) {
      throw new SpeechError(`Gemini does not accept ${mimeType}`, "invalid_media");
    }
    if (audio.data.byteLength > GEMINI_INLINE_MAX_BYTES) {
      throw new SpeechError("Recording too large for Gemini", "invalid_media");
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: TRANSCRIBE_PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: Buffer.from(audio.data).toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SpeechError("Gemini transcription request failed", "provider");
    }
    if (!response.ok) {
      throw new SpeechError("Gemini transcription failed", "provider", response.status);
    }
    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const text = (body?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new SpeechError("No speech found", "empty");
    return text;
  }
}
