export type RetryOptions = {
  /** Extra attempts after the first. */
  retries: number;
  /** Delay before retry n (0-based), in ms. */
  delayMs: (attempt: number) => number;
  /** `attempt` is 0 for the first failure. */
  isRetryable: (error: unknown, attempt: number) => boolean;
  /** A wait the server asked for; used when longer than delayMs. */
  serverDelayMs?: (error: unknown) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying transient failures. The last error is rethrown. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.retries || !options.isRetryable(error, attempt)) throw error;
      const requested = options.serverDelayMs?.(error) ?? 0;
      await sleep(Math.max(options.delayMs(attempt), requested));
    }
  }
}

/** HTTP statuses that usually clear up within seconds (overload, upstream errors). */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Longest server-requested wait we are willing to make the user sit through. */
export const MAX_SERVER_DELAY_MS = 5_000;

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * The wait a provider asked for in its error, e.g. Google's
 * `"retryDelay":"1.95s"`. Undefined when none is given.
 */
export function retryDelayMs(error: unknown): number | undefined {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

/**
 * Retry 5xx errors. Retry a 429 once, and only when the provider says the
 * limit clears within MAX_SERVER_DELAY_MS: a short retryDelay can also come
 * with an exhausted daily quota, so one retry is all it is worth.
 */
export function isTransientHttpError(error: unknown, attempt = 0): boolean {
  const status = statusOf(error);
  if (status === undefined) return false;
  if (TRANSIENT_STATUSES.has(status)) return true;
  if (status === 429) {
    if (attempt > 0) return false;
    const delay = retryDelayMs(error);
    return delay !== undefined && delay <= MAX_SERVER_DELAY_MS;
  }
  return false;
}
