import { createHmac } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  decide,
  RateLimitUnavailableError,
  windowStartOf,
  type RateLimiter,
  type RateLimitResult,
} from "./rate-limit";

/** Expired windows are swept at most this often per server instance. */
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * Hashes the client key (an IP address) so the table never stores it.
 * Keyed with a secret so the hashes cannot be reversed by trying every IPv4
 * address; without RATE_LIMIT_SECRET a fixed key is used.
 */
export function hashClientKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

/**
 * Fixed-window limiter in PostgreSQL, shared by every server instance
 * (ADR-040). Each check is one atomic upsert that increments the current
 * window's count, so concurrent requests on different instances are counted
 * exactly.
 */
export class PostgresRateLimiter implements RateLimiter {
  private lastCleanup = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const start = windowStartOf(now, this.windowMs);
    const windowStart = new Date(start);
    const expiresAt = new Date(start + this.windowMs);
    const hashed = hashClientKey(key, this.secret);

    let rows: { count: number }[];
    try {
      // Parameterised by the tagged template (no string concatenation).
      rows = await this.prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "RateLimit" ("key", "windowStart", "count", "expiresAt")
        VALUES (${hashed}, ${windowStart}, 1, ${expiresAt})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart" THEN "RateLimit"."count" + 1
            ELSE 1
          END,
          "windowStart" = EXCLUDED."windowStart",
          "expiresAt" = EXCLUDED."expiresAt"
        RETURNING "count"`;
    } catch (error) {
      throw new RateLimitUnavailableError("Rate limit check failed", { cause: error });
    }

    await this.cleanupExpired(now);
    return decide(Number(rows[0]?.count ?? 1), this.limit, start, this.windowMs, now);
  }

  /** Deletes finished windows. Failures are ignored; the next check retries. */
  async cleanupExpired(now = this.now()): Promise<number> {
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return 0;
    this.lastCleanup = now;
    try {
      const { count } = await this.prisma.rateLimit.deleteMany({
        where: { expiresAt: { lte: new Date(now) } },
      });
      return count;
    } catch {
      return 0;
    }
  }
}
