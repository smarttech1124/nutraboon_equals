/**
 * Server-side speech (ADR-090), used for WhatsApp voice notes and spoken
 * replies. The website keeps using the browser's own speech (ADR-069).
 * Audio is held in memory only for the request and never stored or logged.
 */

export type Audio = { data: Uint8Array; mimeType: string };

export type SpeechErrorCategory =
  /** No key or provider configured. */
  | "config"
  /** The provider cannot do this (e.g. Claude has no audio input). */
  | "unsupported"
  /** The file type or size is not accepted. */
  | "invalid_media"
  /** The provider failed, timed out or refused. */
  | "provider"
  /** No speech was found in the recording. */
  | "empty";

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly category: SpeechErrorCategory,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "SpeechError";
  }
}

export interface SpeechToText {
  readonly name: string;
  /** The words spoken in the recording; throws SpeechError ("empty" when there are none). */
  transcribe(audio: Audio): Promise<string>;
}

export interface TextToSpeech {
  readonly name: string;
  /** A recording of the text, in a format WhatsApp plays (MP3 or OGG/Opus). */
  synthesize(text: string): Promise<Audio>;
}

/** "audio/ogg; codecs=opus" → "audio/ogg". */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}
