import Anthropic from "@anthropic-ai/sdk";
import { ClaudeProvider } from "../claude";
import { GeminiProvider } from "../gemini";
import { OpenAICompatibleProvider } from "../openai-compatible";
import { AIProviderError, type AIProvider } from "../types";

/** Providers an admin can configure (ADR-047). To add one, extend this map. */
export const PROVIDER_KINDS = ["gemini", "claude", "openai", "deepseek"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

type ProviderSpec = {
  label: string;
  /** Shown next to the model field. Suggestions only: any model ID is accepted. */
  modelSuggestions: string[];
  /** A cheap format check before any network call. */
  keyPattern: RegExp;
  keyFormatHint: string;
};

export const PROVIDERS: Record<ProviderKind, ProviderSpec> = {
  gemini: {
    label: "Google Gemini",
    modelSuggestions: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    // Google has changed key formats before, so only the character set is checked.
    keyPattern: /^[A-Za-z0-9._-]{30,256}$/,
    keyFormatHint: "a Google AI Studio key (usually starts with AIza)",
  },
  claude: {
    label: "Anthropic Claude",
    modelSuggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,256}$/,
    keyFormatHint: "an Anthropic API key starting with sk-ant-",
  },
  openai: {
    label: "OpenAI",
    modelSuggestions: [],
    keyPattern: /^sk-[A-Za-z0-9_-]{20,256}$/,
    keyFormatHint: "an OpenAI key starting with sk-",
  },
  deepseek: {
    label: "DeepSeek",
    modelSuggestions: ["deepseek-chat"],
    keyPattern: /^sk-[A-Za-z0-9]{20,256}$/,
    keyFormatHint: "a DeepSeek key starting with sk-",
  },
};

/** Model IDs as providers write them, e.g. "gpt-…", "models/gemini-…". */
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export function isProviderKind(value: unknown): value is ProviderKind {
  return typeof value === "string" && (PROVIDER_KINDS as readonly string[]).includes(value);
}

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Builds the chat provider for a stored configuration. The key is used, never kept elsewhere. */
export function createProvider(provider: ProviderKind, apiKey: string, model: string): AIProvider {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(apiKey, { model });
    case "claude":
      return new ClaudeProvider(apiKey, { model });
    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: OPENAI_BASE_URL,
        apiKey,
        model,
        jsonMode: "json_schema",
      });
    case "deepseek":
      return new OpenAICompatibleProvider({
        name: "deepseek",
        baseUrl: DEEPSEEK_BASE_URL,
        apiKey,
        model,
        jsonMode: "json_object",
        temperature: 0.4,
      });
  }
}

export type VerificationFailure =
  "invalid_key" | "model_unavailable" | "no_credit" | "rate_limited" | "rejected" | "unreachable";

export type VerificationResult = { ok: true } | { ok: false; reason: VerificationFailure };

/** Fixed admin-facing messages. Provider error bodies are never shown or logged. */
export const VERIFICATION_MESSAGES: Record<VerificationFailure, string> = {
  invalid_key: "The provider rejected this API key. Check that it is correct and still active.",
  model_unavailable:
    "This key cannot use that model, or the model does not exist. Check the model ID.",
  no_credit: "The provider account has no credit or billing set up for this key.",
  rate_limited: "The provider is rate-limiting this key right now. Try again in a minute.",
  rejected: "The provider refused the test request. Check the key's permissions and the model ID.",
  unreachable: "Could not reach the provider. Nothing was saved; try again in a moment.",
};

const VERIFY_TIMEOUT_MS = 15_000;

/**
 * Makes one tiny generation request ("ping", at most a few output tokens),
 * so the key, the model and the account's ability to generate are all
 * checked. No user data is sent.
 */
export async function verifyCredential(
  provider: ProviderKind,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerificationResult> {
  if (provider === "claude") return verifyClaude(apiKey, model);
  let response: Response;
  try {
    response = await fetchImpl(...verificationRequest(provider, apiKey, model));
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.ok) return { ok: true };

  // Read only to classify the error; the text is never returned or logged.
  const body = await response.text().catch(() => "");
  return { ok: false, reason: classify(provider, response.status, body) };
}

/**
 * Claude through the official SDK (ADR-059): one tiny chat reply sent exactly
 * as the chat sends it (structured output with the reply schema, low effort,
 * server-side fallbacks), so a key and model that pass here also work in chat.
 */
export async function verifyClaude(
  apiKey: string,
  model: string,
  client: Anthropic = new Anthropic({ apiKey, timeout: VERIFY_TIMEOUT_MS, maxRetries: 0 }),
): Promise<VerificationResult> {
  try {
    await new ClaudeProvider(apiKey, { model, client }).generateResponse({
      systemPrompt: "You are checking that this connection works. Reply with a short greeting.",
      messages: [{ role: "user", content: "Hello" }],
    });
    return { ok: true };
  } catch (caught) {
    // The provider wraps API errors; classify the original response.
    const cause = (
      caught as { cause?: { status?: number; apiMessage?: string; connection?: boolean } }
    )?.cause;
    if (caught instanceof AIProviderError && !cause?.status) {
      return { ok: false, reason: cause?.connection ? "unreachable" : "rejected" };
    }
    const error = cause?.status
      ? Anthropic.APIError.generate(cause.status, undefined, cause.apiMessage ?? "", new Headers())
      : caught;
    // Most specific first; the error text is used only to spot a billing problem.
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, reason: "invalid_key" };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: "rejected" };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, reason: "model_unavailable" };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (error instanceof Anthropic.BadRequestError) {
      return {
        ok: false,
        reason: /credit balance|billing/i.test(error.message) ? "no_credit" : "model_unavailable",
      };
    }
    if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
      return { ok: false, reason: "unreachable" };
    }
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, reason: "unreachable" };
    return { ok: false, reason: "rejected" };
  }
}

function verificationRequest(
  provider: ProviderKind,
  apiKey: string,
  model: string,
): [string, RequestInit] {
  const signal = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
  const messages = [{ role: "user", content: "ping" }];
  switch (provider) {
    case "claude":
      throw new Error("Claude is verified through the SDK (verifyClaude)");
    case "gemini": {
      const name = model.startsWith("models/") ? model : `models/${model}`;
      return [
        `${GEMINI_BASE_URL}/${name}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal,
        },
      ];
    }
    case "openai":
      return [
        `${OPENAI_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, messages, max_completion_tokens: 16 }),
          signal,
        },
      ];
    case "deepseek":
      return [
        `${DEEPSEEK_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, messages, max_tokens: 1 }),
          signal,
        },
      ];
  }
}

function classify(provider: ProviderKind, status: number, body: string): VerificationFailure {
  if (status === 401) return "invalid_key";
  if (status === 402) return "no_credit";
  if (status === 404) return "model_unavailable";
  if (status === 429) {
    return /insufficient_quota|billing/i.test(body) ? "no_credit" : "rate_limited";
  }
  if (status >= 500 || status === 408) return "unreachable";
  if (status === 403) return provider === "gemini" ? "invalid_key" : "rejected";
  if (status === 400) {
    if (/API_KEY_INVALID|API key not valid/i.test(body)) return "invalid_key";
    if (/model/i.test(body)) return "model_unavailable";
  }
  return "rejected";
}
