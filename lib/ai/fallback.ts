import {
  AIProviderError,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type JsonRequest,
} from "./types";

/** After a primary failure, go straight to the fallback for this long. */
export const PRIMARY_COOLDOWN_MS = 60_000;

/** Shared across rebuilt providers, so a failing primary is not retried on every request. */
export type CooldownState = { skipUntil: number };

/**
 * Tries `primary`, and on any failure answers with `fallback` instead, so a
 * broken optional integration never breaks chat (ADR-052). The caller is told
 * about the failure (e.g. to mark a revoked key) without the user noticing.
 */
export class FallbackProvider implements AIProvider {
  readonly name: string;

  constructor(
    private readonly primary: AIProvider,
    private readonly fallback: AIProvider,
    private readonly options: {
      state: CooldownState;
      onPrimaryFailure?: (error: unknown) => void;
      now?: () => number;
      cooldownMs?: number;
    },
  ) {
    // e.g. "xeelaa>gemini": chat logs show the chain; ai_primary_fallback
    // events show when the fallback answered.
    this.name = `${primary.name}>${fallback.name}`;
  }

  /** Structured tasks go to whichever side supports them, fallback first (the configured default). */
  get generateJson(): ((request: JsonRequest) => Promise<unknown>) | undefined {
    const target = this.fallback.generateJson ? this.fallback : this.primary;
    return target.generateJson ? (request) => target.generateJson!(request) : undefined;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const now = this.options.now ?? Date.now;
    if (now() < this.options.state.skipUntil) return this.fallback.generateResponse(request);
    try {
      return await this.primary.generateResponse(request);
    } catch (error) {
      this.options.state.skipUntil = now() + (this.options.cooldownMs ?? PRIMARY_COOLDOWN_MS);
      const cause = (error as { cause?: { status?: unknown; name?: unknown } }).cause;
      // Status and category only: never the request or the provider's message.
      console.info(
        JSON.stringify({
          event: "ai_primary_fallback",
          from: this.primary.name,
          to: this.fallback.name,
          category: error instanceof AIProviderError ? error.category : "unknown",
          status: typeof cause?.status === "number" ? cause.status : "no_status",
        }),
      );
      this.options.onPrimaryFailure?.(error);
      return this.fallback.generateResponse(request);
    }
  }
}
