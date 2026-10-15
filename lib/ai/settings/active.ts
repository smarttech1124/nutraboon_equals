import type { AIProvider } from "../types";
import type { ProviderKind } from "./providers";

/** How long a server instance trusts its view of the active configuration. */
export const ACTIVE_CACHE_MS = 30_000;
/** After a failed lookup, try again sooner. */
export const ERROR_CACHE_MS = 5_000;

export type ActiveCredential = {
  id: string;
  provider: ProviderKind;
  model: string;
  apiKey: string;
  updatedAt: Date;
};

export type ActiveProviderDeps = {
  /** Null when no configuration is active. */
  loadActive: () => Promise<ActiveCredential | null>;
  build: (credential: ActiveCredential) => AIProvider;
  /** The environment-variable provider (GEMINI_API_KEY etc.), used when nothing is active. */
  fallback: () => AIProvider;
  now?: () => number;
};

/**
 * Picks the chat provider: the active database configuration if there is
 * one, otherwise the environment variables (ADR-047). Each instance caches
 * its choice for ACTIVE_CACHE_MS, so a switch made on another instance takes
 * effect within that time; `invalidate` applies it at once on this one.
 * The decrypted key lives only inside the built provider.
 */
export class ActiveProviderResolver {
  private cached?: { provider: AIProvider; version: string; expiresAt: number };
  private readonly now: () => number;

  constructor(private readonly deps: ActiveProviderDeps) {
    this.now = deps.now ?? Date.now;
  }

  async get(): Promise<AIProvider> {
    const now = this.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached.provider;

    let credential: ActiveCredential | null;
    try {
      credential = await this.deps.loadActive();
    } catch (error) {
      // Database or decryption trouble: keep chat running on the env settings.
      console.error(
        JSON.stringify({
          event: "ai_config_unavailable",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      const provider = this.deps.fallback();
      this.cached = { provider, version: "env-error", expiresAt: now + ERROR_CACHE_MS };
      return provider;
    }

    const version = credential ? `${credential.id}:${credential.updatedAt.getTime()}` : "env";
    if (this.cached?.version === version) {
      this.cached.expiresAt = now + ACTIVE_CACHE_MS;
      return this.cached.provider;
    }
    const provider = credential ? this.deps.build(credential) : this.deps.fallback();
    this.cached = { provider, version, expiresAt: now + ACTIVE_CACHE_MS };
    return provider;
  }

  invalidate(): void {
    this.cached = undefined;
  }
}
