import { DEMO_SIGN_VIDEOS } from "./demo-videos";
import {
  DEMO_NOTICE,
  type SignLanguageResponseProvider,
  type SignRequest,
  type SignResponse,
  type SignVideo,
} from "./types";

/**
 * The demonstration provider (ADR-077): returns a random video from the
 * collection, skipping excluded ids. It deliberately ignores the reply text:
 * the video is a sample of the experience, not a translation.
 */
export class DemoSignProvider implements SignLanguageResponseProvider {
  readonly id = "demo" as const;
  readonly available = true;

  constructor(
    private readonly videos: SignVideo[] = DEMO_SIGN_VIDEOS,
    private readonly random: () => number = Math.random,
  ) {}

  async respond(request: SignRequest): Promise<SignResponse | null> {
    const excluded = new Set(request.exclude);
    const candidates = this.videos.filter((v) => !excluded.has(v.id));
    if (candidates.length === 0) return null;
    const video =
      candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))]!;
    return { kind: "demo", video, notice: DEMO_NOTICE };
  }
}
