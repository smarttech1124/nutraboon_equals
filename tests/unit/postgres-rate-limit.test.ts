import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { hashClientKey, PostgresRateLimiter } from "@/lib/http/postgres-rate-limit";
import { RateLimitUnavailableError } from "@/lib/http/rate-limit";

function fakePrisma(count: number | Error) {
  const queryRaw = vi.fn<(...args: unknown[]) => Promise<{ count: number }[]>>(async () => {
    if (count instanceof Error) throw count;
    return [{ count }];
  });
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const prisma = { $queryRaw: queryRaw, rateLimit: { deleteMany } } as unknown as PrismaClient;
  return { prisma, queryRaw, deleteMany };
}

describe("PostgresRateLimiter", () => {
  it("allows up to the limit and blocks after, with the wait until the next window", async () => {
    const now = () => 61_500;
    const under = new PostgresRateLimiter(fakePrisma(20).prisma, 20, 60_000, "s", now);
    const over = new PostgresRateLimiter(fakePrisma(21).prisma, 20, 60_000, "s", now);

    expect(await under.check("1.2.3.4")).toEqual({ allowed: true });
    expect(await over.check("1.2.3.4")).toEqual({ allowed: false, retryAfterSeconds: 59 });
  });

  it("sends a hash of the client address, never the address, as a query parameter", async () => {
    const { prisma, queryRaw } = fakePrisma(1);
    await new PostgresRateLimiter(prisma, 20, 60_000, "secret", () => 0).check("1.2.3.4");

    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).not.toContain("1.2.3.4");
    expect(values).toContain(hashClientKey("1.2.3.4", "secret"));
    expect(values).not.toContain("1.2.3.4");
  });

  it("keys hashes with the secret", () => {
    expect(hashClientKey("1.2.3.4", "a")).not.toBe(hashClientKey("1.2.3.4", "b"));
    expect(hashClientKey("1.2.3.4", "a")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wraps database errors so callers can let the request through", async () => {
    const limiter = new PostgresRateLimiter(
      fakePrisma(new Error("connection refused")).prisma,
      20,
      60_000,
      "s",
    );
    await expect(limiter.check("1.2.3.4")).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it("sweeps finished windows at most once a minute", async () => {
    let t = 0;
    const { prisma, deleteMany } = fakePrisma(1);
    const limiter = new PostgresRateLimiter(prisma, 20, 60_000, "s", () => t);
    await limiter.check("a");
    await limiter.check("b");
    t = 60_000;
    await limiter.check("c");
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });
});
