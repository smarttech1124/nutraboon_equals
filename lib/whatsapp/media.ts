import { baseMimeType } from "@/lib/speech/types";

/**
 * WhatsApp's media rules (ADR-090), from Meta's Cloud API media reference
 * (developers.facebook.com/docs/whatsapp/cloud-api/reference/media),
 * checked on 19 October 2026:
 * - audio: AAC, AMR, MP3, MP4 audio, and OGG with the Opus codec (mono), up to 16 MB;
 * - video: MP4 or 3GPP with H.264 video and AAC audio, up to 16 MB. Android
 *   needs the Main or Baseline profile without B-frames.
 * - Media URLs from Meta expire after 5 minutes; IDs in webhooks after 7 days.
 */

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/amr",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
]);
export const VIDEO_TYPES = new Set(["video/mp4", "video/3gpp"]);

export type MediaCheck = { ok: true } | { ok: false; reason: "type" | "size" };

export function checkMedia(kind: "audio" | "video", mimeType: string, bytes: number): MediaCheck {
  const types = kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES;
  if (!types.has(baseMimeType(mimeType))) return { ok: false, reason: "type" };
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_MEDIA_BYTES) {
    return { ok: false, reason: "size" };
  }
  return { ok: true };
}
