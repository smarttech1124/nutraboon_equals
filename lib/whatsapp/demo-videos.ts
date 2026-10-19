import { DEMO_SIGN_VIDEOS } from "@/lib/sign/demo-videos";
import { DEMO_NOTICE, type SignVideo } from "@/lib/sign/types";

/**
 * The sign-language demo on WhatsApp (ADR-090): exactly two of the website's
 * sample videos, in Nigerian Sign Language. WhatsApp only plays MP4 (H.264
 * and AAC) up to 16 MB, and the originals are WebM, so
 * `npm run whatsapp:videos` copies these two into Cloudinary once, under the
 * fixed IDs below, and Cloudinary serves an MP4 version. Both are CC BY-SA
 * 4.0, which allows sharing copies with the credit in every caption.
 *
 * Like the website, these are samples: they do not translate the reply.
 */

export const WHATSAPP_DEMO_VIDEO_IDS = ["nsl-can-you-help-me", "nsl-how-much-is-it"] as const;

/** Small, Android-safe MP4: H.264 Baseline (no B-frames), AAC audio, at most 480 px wide. */
export const MP4_TRANSFORMATION = "w_480,c_limit,vc_h264:baseline:3.1,ac_aac,q_auto";

export type WhatsAppDemoVideo = {
  video: SignVideo;
  publicId: string;
  /** The public MP4 Meta fetches. */
  url: string;
  caption: string;
};

export function publicIdFor(index: number): string {
  return `nutraboom/whatsapp/sign-demo-${index + 1}`;
}

export function deliveryUrl(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/video/upload/${MP4_TRANSFORMATION}/${publicId}.mp4`;
}

export function captionFor(video: SignVideo): string {
  const a = video.attribution;
  return `${DEMO_NOTICE}\n\n${video.title}. Video: ${a.author}, ${a.license}, via ${a.sourceName}.`;
}

/** The two videos, or none when Cloudinary is not configured (the demo is then unavailable). */
export function whatsappDemoVideos(
  env: Record<string, string | undefined> = process.env,
): WhatsAppDemoVideo[] {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) return [];
  return WHATSAPP_DEMO_VIDEO_IDS.map((id, i) => {
    const video = DEMO_SIGN_VIDEOS.find((v) => v.id === id);
    if (!video) throw new Error(`Unknown demo video ${id}`);
    const publicId = publicIdFor(i);
    return { video, publicId, url: deliveryUrl(cloudName, publicId), caption: captionFor(video) };
  });
}
