import { parseAssistantOutput } from "@/lib/ai/parse";
import { AIProviderError, type AIProvider, type AIRequest, type AIResponse } from "@/lib/ai/types";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";

/**
 * XEELAA API v2 client (ADR-052). Documented at https://xeelaa.com/api-functions:
 * `Authorization: Bearer xla_<key_id>:<secret>`, GET /api/v2/verify,
 * GET /api/v2/usage and POST /api/v2/ai/chat. Responses use the envelope
 * `{ success, message, data }`.
 *
 * Checked live on 2026-10-04: /api/v2/verify answers 200 with or without a
 * key (it reports the API's status only), while /usage and /ai/chat answer
 * 401 "Invalid or expired API key." So a key is verified with /usage, then
 * /me if /usage fails for a reason other than the key. The docs do not give request or
 * response bodies, a system prompt or JSON output for /ai/chat, so the chat
 * request below is a best guess and every reply must pass the same validation
 * as any provider; anything else falls back to the default provider.
 */

export const XEELAA_BASE_URL = "https://xeelaa.com";
/** "xla_" + key id + ":" + secret. */
export const XEELAA_KEY_PATTERN = /^xla_[A-Za-z0-9_-]{4,128}:[A-Za-z0-9_.~+/=-]{8,256}$/;
/** Generous: an account's usage figures can take a while to compute. */
export const VERIFY_TIMEOUT_MS = 20_000;
/** Authenticated endpoints that prove a key works, tried in order. */
export const VERIFY_ENDPOINTS = ["/api/v2/usage", "/api/v2/me"] as const;
/** Short, so a fallback still fits inside the chat route's 60 s. */
export const XEELAA_CHAT_TIMEOUT_MS = 15_000;

export type XeelaaFailure =
  "invalid_key" | "rate_limited" | "timeout" | "server_error" | "network" | "rejected";
/** `status` is XEELAA's HTTP status, when it answered. */
export type XeelaaCheck = { ok: true } | { ok: false; reason: XeelaaFailure; status?: number };

export const XEELAA_MESSAGES: Record<XeelaaFailure, string> = {
  invalid_key: "XEELAA rejected this key. It may be wrong, expired or revoked.",
  rate_limited: "XEELAA is rate-limiting this key right now. Try again in a minute.",
  timeout: `XEELAA did not answer within ${VERIFY_TIMEOUT_MS / 1000} seconds. Nothing was changed; try again.`,
  server_error:
    "XEELAA had a server error. Nothing was changed; try again later, or contact XEELAA if it continues.",
  network:
    "Could not connect to XEELAA from this server. Check its internet connection, then try again.",
  rejected: "XEELAA refused the request. Check the key's permissions.",
};

/** The admin-facing message, with XEELAA's HTTP status when there was one. */
export function describeXeelaaFailure(check: { reason: XeelaaFailure; status?: number }): string {
  const message = XEELAA_MESSAGES[check.reason];
  return check.status ? `${message} (XEELAA answered HTTP ${check.status}.)` : message;
}

export function classifyXeelaaStatus(status: number): XeelaaFailure {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server_error";
  return "rejected";
}

/** A fetch that threw: our time limit, or no connection at all. */
function thrownFailure(error: unknown): XeelaaFailure {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

/** Status or error name only: never the key, the request or XEELAA's message. */
function logCheck(endpoint: string, started: number, outcome: Record<string, unknown>): void {
  console.info(
    JSON.stringify({ event: "xeelaa_check", endpoint, ms: Date.now() - started, ...outcome }),
  );
}

function headers(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}`, accept: "application/json" };
}

/** One authenticated GET; the body is read only for `success: false`. */
async function probe(
  endpoint: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<XeelaaCheck> {
  const started = Date.now();
  try {
    const res = await fetchImpl(`${baseUrl}${endpoint}`, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    logCheck(endpoint, started, { status: res.status });
    if (!res.ok) return { ok: false, reason: classifyXeelaaStatus(res.status), status: res.status };
    const body = (await res.json().catch(() => undefined)) as { success?: unknown } | undefined;
    return body?.success === false
      ? { ok: false, reason: "invalid_key", status: res.status }
      : { ok: true };
  } catch (error) {
    const cause = (error as { cause?: { code?: unknown } }).cause;
    logCheck(endpoint, started, {
      error: error instanceof Error ? error.name : "unknown",
      ...(typeof cause?.code === "string" ? { code: cause.code } : {}),
    });
    return { ok: false, reason: thrownFailure(error) };
  }
}

/**
 * Checks a key with authenticated calls; /api/v2/verify does not check keys.
 * A clear answer about the key (accepted, rejected, rate-limited) is final.
 * Anything else on /usage (a server error, a time-out, an unexpected status)
 * is tried again on /me before giving up. No body text is returned: it could
 * quote the key.
 */
export async function verifyXeelaaKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl = XEELAA_BASE_URL,
): Promise<XeelaaCheck> {
  let first: XeelaaCheck | undefined;
  for (const endpoint of VERIFY_ENDPOINTS) {
    const check = await probe(endpoint, apiKey, fetchImpl, baseUrl);
    if (check.ok || check.reason === "invalid_key" || check.reason === "rate_limited") {
      return check;
    }
    first ??= check;
  }
  return first!;
}

export type UsageItem = { label: string; value: string };
export type XeelaaUsage =
  { ok: true; items: UsageItem[] } | { ok: false; reason: XeelaaFailure; status?: number };

const MAX_USAGE_ITEMS = 20;
/** Fields that could hold a credential are never shown, whatever XEELAA returns. */
const SECRET_FIELD = /key|secret|token|auth|password/i;

/** Flattens a usage response into label/value pairs (numbers, strings, booleans only). */
export function flattenUsage(data: unknown, prefix = "", out: UsageItem[] = []): UsageItem[] {
  if (out.length >= MAX_USAGE_ITEMS || data === null || typeof data !== "object") return out;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (out.length >= MAX_USAGE_ITEMS) break;
    if (SECRET_FIELD.test(key)) continue;
    const label = (prefix ? `${prefix} ` : "") + key.replace(/_/g, " ");
    if (typeof value === "number" || typeof value === "boolean") {
      out.push({ label, value: String(value) });
    } else if (typeof value === "string" && value.length <= 80) {
      out.push({ label, value });
    } else if (value && typeof value === "object" && !Array.isArray(value) && !prefix) {
      flattenUsage(value, label, out);
    }
  }
  return out;
}

/** GET /api/v2/usage, reduced to safe display items. */
export async function fetchXeelaaUsage(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl = XEELAA_BASE_URL,
): Promise<XeelaaUsage> {
  try {
    const res = await fetchImpl(`${baseUrl}/api/v2/usage`, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: classifyXeelaaStatus(res.status), status: res.status };
    const json = (await res.json()) as { data?: unknown };
    return { ok: true, items: flattenUsage(json?.data ?? json) };
  } catch (error) {
    return { ok: false, reason: thrownFailure(error) };
  }
}

/** An HTTP failure carrying only its status. */
export class XeelaaHttpError extends Error {
  constructor(readonly status: number) {
    super(`XEELAA HTTP ${status}`);
    this.name = "XeelaaHttpError";
  }
}

/** The reply text, wherever a chat API usually puts it. */
export function replyText(json: unknown): string | undefined {
  const j = json as Record<string, unknown> | null;
  const data = (j?.data ?? {}) as Record<string, unknown>;
  const choices = j?.choices as { message?: { content?: unknown } }[] | undefined;
  const candidates = [
    j?.response,
    j?.reply,
    j?.content,
    j?.message,
    data.response,
    data.reply,
    data.content,
    data.message,
    choices?.[0]?.message?.content,
  ];
  return candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** Strips a ```json fence some chat APIs wrap around JSON. */
function unfence(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (match ? match[1] : text).trim();
}

/** One message holding the layered prompt, the conversation and the output contract. */
export function composeXeelaaMessage(request: AIRequest): string {
  const transcript = request.messages
    .map((m) => `${m.role === "assistant" ? "ASSISTANT" : "USER"}: ${m.content}`)
    .join("\n");
  return [
    request.systemPrompt,
    "CONVERSATION (latest message last):",
    transcript,
    `OUTPUT FORMAT: reply with only one JSON object, no other text, matching this JSON schema:\n${JSON.stringify(assistantResponseJsonSchema)}`,
  ].join("\n\n");
}

/**
 * Chat through POST /api/v2/ai/chat (ADR-052). No retries: on any failure the
 * fallback provider answers instead (see FallbackProvider).
 */
export class XeelaaProvider implements AIProvider {
  readonly name = "xeelaa";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = XEELAA_BASE_URL,
  ) {}

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    let text: string | undefined;
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/api/v2/ai/chat?search_web=false&reasoning=false`,
        {
          method: "POST",
          headers: { ...headers(this.apiKey), "content-type": "application/json" },
          body: JSON.stringify({ message: composeXeelaaMessage(request) }),
          signal: AbortSignal.timeout(XEELAA_CHAT_TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new XeelaaHttpError(res.status);
      text = replyText(await res.json());
    } catch (error) {
      throw new AIProviderError("XEELAA request failed", "provider", { cause: error });
    }
    return parseAssistantOutput(text === undefined ? undefined : unfence(text));
  }
}
