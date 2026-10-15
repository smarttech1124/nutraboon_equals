import { GoogleGenAI } from "@google/genai";
import {
  AIProviderError,
  parseJsonText,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type JsonRequest,
} from "./types";
import { parseAssistantOutput } from "./parse";
import { isTransientHttpError, retryDelayMs, withRetry } from "./retry";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Per-attempt timeout, so retries stay within a reasonable wait for the user. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Two retries (about 0.5 s and 1.5 s apart, plus jitter) for overload and upstream errors. */
const RETRIES = 2;
/**
 * The fallback model is only tried if the primary gave up within this time,
 * leaving room for it inside the route's 60 s maxDuration (ADR-044).
 */
export const FALLBACK_DEADLINE_MS = 35_000;

export type GeminiOptions = {
  model?: string;
  /** Tried once the primary model's retries are used up on a recoverable error (ADR-044). */
  fallbackModel?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * Errors another model may not share: overload and server errors (5xx), an
 * exhausted per-model quota (429), an unavailable model (404), and timeouts or
 * network failures (no HTTP status). A bad request or bad key would fail on
 * any model, so those are not retried elsewhere.
 */
export function shouldUseFallback(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status === 404 || status === 429 || status >= 500;
}

/**
 * After the primary model fails over, requests skip it for this long and go
 * straight to the fallback model, instead of spending each request's time on
 * retries that will probably fail too (ADR-066). Shared across instances,
 * keyed by model, because providers are rebuilt when settings change.
 */
export const PRIMARY_COOLDOWN_MS = 60_000;
const primaryCooldown = new Map<string, number>();

/** Test hook. */
export function resetGeminiCooldownForTests(): void {
  primaryCooldown.clear();
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly fallbackModel?: string;
  private readonly sleep?: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(apiKey: string, options: GeminiOptions = {}) {
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
    this.model = options.model || DEFAULT_GEMINI_MODEL;
    this.fallbackModel =
      options.fallbackModel && options.fallbackModel !== this.model
        ? options.fallbackModel
        : undefined;
    this.sleep = options.sleep;
    this.now = options.now ?? Date.now;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    return parseAssistantOutput(await this.run(request, assistantResponseJsonSchema));
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    const text = await this.run(
      { systemPrompt: request.systemPrompt, messages: [{ role: "user", content: request.prompt }] },
      request.schema,
      request.timeoutMs,
    );
    return parseJsonText(text);
  }

  /** The primary model, then the fallback model on a recoverable error (ADR-044). */
  private async run(
    request: AIRequest,
    schema: unknown,
    timeoutMs?: number,
  ): Promise<string | undefined> {
    // A long task may use its whole time limit on the primary and still fall back.
    const deadline = timeoutMs ? timeoutMs + 5_000 : FALLBACK_DEADLINE_MS;
    const started = this.now();
    if (this.fallbackModel && started < (primaryCooldown.get(this.model) ?? 0)) {
      try {
        return await this.generate(this.fallbackModel, request, schema, timeoutMs);
      } catch (error) {
        throw new AIProviderError("Gemini fallback model failed", "provider", { cause: error });
      }
    }
    let text: string | undefined;
    try {
      text = await this.generate(this.model, request, schema, timeoutMs);
    } catch (error) {
      const canFallBack =
        this.fallbackModel !== undefined &&
        shouldUseFallback(error) &&
        this.now() - started < deadline;
      if (!canFallBack) {
        throw new AIProviderError("Gemini request failed", "provider", { cause: error });
      }
      primaryCooldown.set(this.model, this.now() + PRIMARY_COOLDOWN_MS);
      // Model names and status only; never user content (CLAUDE.md §28).
      console.info(
        JSON.stringify({
          event: "ai_fallback",
          from: this.model,
          to: this.fallbackModel,
          status: (error as { status?: unknown }).status ?? "no_status",
        }),
      );
      try {
        text = await this.generate(this.fallbackModel!, request, schema, timeoutMs);
      } catch (fallbackError) {
        throw new AIProviderError(
          "Gemini request failed on primary and fallback models",
          "provider",
          {
            cause: fallbackError,
          },
        );
      }
    }
    return text;
  }

  private async generate(
    model: string,
    request: AIRequest,
    schema: unknown,
    timeoutMs?: number,
  ): Promise<string | undefined> {
    const response = await withRetry(
      () =>
        this.client.models.generateContent({
          model,
          contents: request.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          config: {
            systemInstruction: request.systemPrompt,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            temperature: 0.4,
            ...(timeoutMs ? { httpOptions: { timeout: timeoutMs } } : {}),
          },
        }),
      {
        retries: RETRIES,
        delayMs: (attempt) => 500 * 3 ** attempt + Math.random() * 250,
        isRetryable: isTransientHttpError,
        serverDelayMs: retryDelayMs,
        sleep: this.sleep,
      },
    );
    return response.text;
  }
}
