import Anthropic from "@anthropic-ai/sdk";
import { parseAssistantOutput } from "./parse";
import {
  AIProviderError,
  parseJsonText,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type JsonRequest,
} from "./types";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";

/** Default model (ADR-059). Override per configuration in the admin portal or CLAUDE_MODEL. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
/** Per-request limit; the SDK retries 408/409/429/5xx itself (maxRetries). */
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
/** A chat reply is a short JSON object; this leaves room for adaptive thinking too. */
const MAX_TOKENS = 16_000;

type JsonSchema = Record<string, unknown>;

/**
 * Structured outputs need `additionalProperties: false` on every object
 * (Claude API structured outputs). Adds it without changing anything else.
 */
export function strictSchema(schema: unknown): JsonSchema {
  if (Array.isArray(schema)) return schema.map(strictSchema) as unknown as JsonSchema;
  if (!schema || typeof schema !== "object") return schema as JsonSchema;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] =
      key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strictSchema(v)]))
        : key === "items" || key === "anyOf" || key === "allOf"
          ? strictSchema(value)
          : value;
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/**
 * Structured outputs allow at most 24 optional properties across a schema
 * (the reply schema has more). Free-text and list properties without an
 * enum are made required instead: the model writes "" or [] when it has
 * nothing, and dropEmptyOptionals removes those before validation, so the
 * app sees the same shape as before. Union types (e.g. nullable) are not
 * used, because the API limits those too.
 */
export function claudeSchema(schema: unknown): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: JsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        key === "properties" && value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
          : key === "items" || key === "anyOf" || key === "allOf"
            ? walk(value)
            : value;
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      const required = new Set((out.required as string[] | undefined) ?? []);
      for (const [k, v] of Object.entries(out.properties as Record<string, JsonSchema>)) {
        if (!required.has(k) && emptyable(v)) required.add(k);
      }
      out.required = [...required];
    }
    return out;
  };
  return strictSchema(walk(schema));
}

function emptyable(property: JsonSchema): boolean {
  return (property.type === "string" || property.type === "array") && !("enum" in property);
}

/** Removes optional properties (per the original schema) that came back as "" or []. */
export function dropEmptyOptionals(value: unknown, schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return value;
  const node = schema as JsonSchema;
  if (Array.isArray(value)) {
    return node.items ? value.map((v) => dropEmptyOptionals(v, node.items)) : value;
  }
  if (!value || typeof value !== "object" || !node.properties) return value;
  const properties = node.properties as Record<string, JsonSchema>;
  const required = new Set((node.required as string[] | undefined) ?? []);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const empty = v === "" || (Array.isArray(v) && v.length === 0);
    if (empty && !required.has(k) && properties[k] && emptyable(properties[k])) continue;
    out[k] = dropEmptyOptionals(v, properties[k]);
  }
  return out;
}

/** The API's own explanation of a failed request (about the request, never the conversation). */
function apiDetail(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { type?: string; message?: string } } | undefined;
  const type = body?.error?.type ?? "";
  const message = body?.error?.message ?? error.message ?? "";
  return `${type}${type && message ? ": " : ""}${message}`.slice(0, 300);
}

/** A 400 about the fallbacks parameter or its beta header. */
function rejectsFallbacks(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIError &&
    (error.status === 400 || error.status === 403) &&
    /fallback|anthropic-beta|beta/i.test(apiDetail(error))
  );
}

/**
 * Logs why Claude rejected a request: HTTP status, error type and the API's
 * message, which describes the request (model, parameters, schema, billing).
 * Never the prompt or the conversation (CLAUDE.md §28).
 */
function logClaudeError(error: unknown, model: string, event: string) {
  console.error(
    JSON.stringify({
      event: `claude_${event}`,
      model,
      status: error instanceof Anthropic.APIError ? (error.status ?? null) : null,
      detail:
        error instanceof Anthropic.APIError
          ? apiDetail(error)
          : error instanceof Error
            ? error.name
            : "unknown",
    }),
  );
}

/**
 * Anthropic Claude through the official SDK (ADR-059). Same contract as the
 * other providers: layered system prompt and conversation in, a validated
 * AssistantResponse out. Replies use structured outputs (`output_config.format`
 * with the reply's JSON schema) and every reply still passes
 * parseAssistantOutput and the app's safety checks.
 *
 * Server-side refusal fallbacks (`fallbacks: "default"`) are on: if a safety
 * classifier declines a request, the API retries it on the model Anthropic
 * recommends for that category instead of failing the chat.
 */
export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model: string;
  /** Turned off for this instance if the API rejects the fallbacks beta. */
  private fallbacksAccepted = true;

  constructor(apiKey: string, options: { model?: string; client?: Anthropic } = {}) {
    this.client =
      options.client ??
      new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    this.model = options.model || DEFAULT_CLAUDE_MODEL;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    // The API requires the first message to come from the user; a trimmed
    // history can start with an assistant turn.
    const firstUser = request.messages.findIndex((m) => m.role === "user");
    const messages: Anthropic.Beta.BetaMessageParam[] = request.messages
      .slice(firstUser < 0 ? request.messages.length : firstUser)
      .map((m) => ({ role: m.role, content: m.content }));
    return parseAssistantOutput(
      await this.complete(request.systemPrompt, messages, assistantResponseJsonSchema),
    );
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    const text = await this.complete(
      request.systemPrompt,
      [{ role: "user", content: request.prompt }],
      request.schema,
      request.timeoutMs,
    );
    return parseJsonText(text);
  }

  private async complete(
    system: string,
    messages: Anthropic.Beta.BetaMessageParam[],
    schema: unknown,
    timeoutMs?: number,
  ): Promise<string> {
    const sentSchema = claudeSchema(schema);
    const send = (withFallbacks: boolean) =>
      this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          ...(withFallbacks
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
          system,
          messages,
          output_config: {
            // Replies are short structured objects; low effort keeps them quick.
            effort: "low",
            format: { type: "json_schema", schema: sentSchema },
          },
        },
        timeoutMs ? { timeout: timeoutMs } : undefined,
      );

    let response: Anthropic.Beta.BetaMessage;
    try {
      try {
        response = await send(this.fallbacksAccepted);
      } catch (error) {
        // Server-side fallbacks are a beta that some accounts, models and
        // platforms reject. A chat must not fail for an optional feature:
        // retry once without it, and stop sending it from this instance.
        if (!this.fallbacksAccepted || !rejectsFallbacks(error)) throw error;
        this.fallbacksAccepted = false;
        logClaudeError(error, this.model, "fallbacks_rejected");
        response = await send(false);
      }
    } catch (error) {
      logClaudeError(error, this.model, "request_failed");
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      throw new AIProviderError("Claude request failed", "provider", {
        cause: Object.assign(new Error(`Claude ${status ?? "network"} error`), {
          status,
          apiMessage: error instanceof Anthropic.APIError ? apiDetail(error) : undefined,
          connection: error instanceof Anthropic.APIConnectionError,
        }),
      });
    }

    if (response.stop_reason === "refusal") {
      throw new AIProviderError("Claude declined the request", "provider");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIProviderError("Claude reply was cut off", "invalid_output");
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return JSON.stringify(dropEmptyOptionals(JSON.parse(text), schema));
    } catch {
      return text; // Not JSON: the caller's parser reports it.
    }
  }
}
