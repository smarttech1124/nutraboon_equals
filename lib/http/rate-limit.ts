export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

/**
 * The limiter's storage failed. Callers let the request through and log it:
 * rate limiting protects capacity, not user safety (ADR-040).
 */
export class RateLimitUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RateLimitUnavailableError";
  }
}

/** 20 chat messages per minute per client. */
export const CHAT_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

/**
 * Windows are aligned to the clock (e.g. 12:00:00–12:00:59 for one minute),
 * so a single atomic database statement can count them (ADR-040).
 */
export function windowStartOf(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function decide(
  count: number,
  limit: number,
  windowStart: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  if (count <= limit) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

/** Process-local limiter for tests and for running without a database. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const start = windowStartOf(now, this.windowMs);
    const window = this.windows.get(key);
    const count = window && window.start === start ? window.count + 1 : 1;
    this.windows.set(key, { start, count });
    this.prune(start);
    return decide(count, this.limit, start, this.windowMs, now);
  }

  private prune(currentStart: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (window.start < currentStart) this.windows.delete(key);
    }
  }
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
