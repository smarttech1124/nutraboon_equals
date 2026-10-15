/**
 * Sign-language responses (ADR-077). Communication modules ask for a
 * sign-language response to a reply; a provider returns a video. Today the
 * only working provider is a demonstration that returns a random sample
 * video, unrelated to the reply. A real translation provider can replace it
 * behind this interface (docs/signapse-integration.md).
 *
 * Types only: safe to import from client components.
 */

/** Where a request comes from, for routing, analytics and logs. Never the user's identity. */
export const SIGN_MODULES = ["assistant", "planner", "hospital"] as const;
export type SignModule = (typeof SIGN_MODULES)[number];

/** The sign language a video is in. Different sign languages are not interchangeable. */
export type SignLanguage =
  | "Nigerian Sign Language"
  | "Ghanaian Sign Language"
  | "Tanzanian Sign Language"
  | "American Sign Language"
  | "Spanish Sign Language"
  | "British Sign Language";

export type SignVideoSource = { src: string; type: string };

export type SignVideo = {
  id: string;
  title: string;
  language: SignLanguage;
  /** Verified length in seconds. */
  durationSeconds: number;
  /** In order of preference; the browser plays the first it supports. */
  sources: SignVideoSource[];
  orientation: "landscape" | "portrait";
  /** Credit line required by the licence. */
  attribution: {
    author: string;
    license: string;
    licenseUrl: string;
    sourceUrl: string;
    sourceName: string;
  };
  /** Whether the file has a soundtrack (players start muted either way). */
  hasAudio: boolean;
};

export type SignResponse = {
  /** "demo": a sample unrelated to the reply. "translation": a real signed rendering of the reply. */
  kind: "demo" | "translation";
  video: SignVideo;
  /** Shown with every demo video; a real provider may add its own notice. */
  notice: string | null;
};

export type SignRequest = {
  /** The reply to sign. The demo provider ignores it and never stores it. */
  text: string;
  module: SignModule;
  /** Video ids not to return: already shown, or failed to play in this browser. */
  exclude: string[];
};

export interface SignLanguageResponseProvider {
  readonly id: "demo" | "production";
  /** False when the provider cannot serve requests (e.g. not configured). */
  readonly available: boolean;
  /** A response, or null when nothing can be offered (e.g. every demo video excluded). */
  respond(request: SignRequest): Promise<SignResponse | null>;
}

export const DEMO_NOTICE =
  "Demo mode: This is a sample sign-language video and does not translate or represent your response.";
