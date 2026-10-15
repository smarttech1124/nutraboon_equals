import type { SignLanguageResponseProvider, SignResponse } from "./types";

/**
 * Reserved for the real sign-language translation provider (ADR-077).
 *
 * Not implemented: no provider, credentials or API contract have been agreed
 * yet, and endpoints must not be guessed. When they are, implement respond()
 * here on the server (secrets never reach the browser), return
 * { kind: "translation", video, notice } and set available to true when
 * configured. See docs/signapse-integration.md for the research so far.
 */
export class ProductionSignProvider implements SignLanguageResponseProvider {
  readonly id = "production" as const;
  readonly available = false;

  async respond(): Promise<SignResponse | null> {
    return null;
  }
}
