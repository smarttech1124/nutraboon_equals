import { describe, expect, it, vi } from "vitest";
import { isTransientHttpError, retryDelayMs, withRetry } from "@/lib/ai/retry";

const httpError = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });
/** Shaped like Google's 429 body, which carries a retryDelay. */
const rateLimited = (delay: string) =>
  httpError(
    429,
    `{"error":{"code":429,"details":[{"@type":"RetryInfo","retryDelay":"${delay}"}]}}`,
  );
const noSleep = vi.fn(async () => {});

describe("withRetry", () => {
  const options = {
    retries: 2,
    delayMs: (n: number) => 100 * (n + 1),
    isRetryable: isTransientHttpError,
    serverDelayMs: retryDelayMs,
    sleep: noSleep,
  };

  it("retries transient failures and returns the eventual result", async () => {
    noSleep.mockClear();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(fn, options)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(noSleep.mock.calls).toEqual([[100], [200]]);
  });

  it("gives up after the retry budget and rethrows the last error", async () => {
    const fn = vi.fn(async () => {
      throw httpError(503);
    });
    await expect(withRetry(fn, options)).rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404, 429])("does not retry a %d", async (status) => {
    const fn = vi.fn(async () => {
      throw httpError(status);
    });
    await expect(withRetry(fn, options)).rejects.toMatchObject({ status });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a per-minute rate limit once the server-requested wait has passed", async () => {
    noSleep.mockClear();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimited("1.95s"))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(fn, options)).resolves.toBe("ok");
    expect(noSleep.mock.calls).toEqual([[1950]]);
  });

  it("retries a rate limit only once", async () => {
    const fn = vi.fn(async () => {
      throw rateLimited("1s");
    });
    await expect(withRetry(fn, options)).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 429 whose wait is too long (an exhausted quota)", async () => {
    const fn = vi.fn(async () => {
      throw rateLimited("3600s");
    });
    await expect(withRetry(fn, options)).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reads retryDelay from a provider error", () => {
    expect(retryDelayMs(rateLimited("1.95s"))).toBe(1950);
    expect(retryDelayMs(httpError(429))).toBeUndefined();
  });

  it("does not retry errors without an HTTP status", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("bug");
    });
    await expect(withRetry(fn, options)).rejects.toThrow(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
