import {
  AIProviderError,
  parseJsonText,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type JsonRequest,
} from "./types";
import { parseAssistantOutput } from "./parse";
import { isTransientHttpError, withRetry } from "./retry";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";

/** Per-attempt timeout, matching the Gemini provider. */
const REQUEST_TIMEOUT_MS = 20_000;
const RETRIES = 2;

export type OpenAICompatibleOptions = {
  /** Shown in logs, e.g. "openai" or "deepseek". */
  name: string;
  /** API root without a trailing slash, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * "json_schema" sends the reply schema as structured output (OpenAI).
   * "json_object" asks for any JSON and puts the schema in the system prompt
   * (DeepSeek, which has no schema mode). The reply is validated either way.
   */
  jsonMode: "json_schema" | "json_object";
  /** Omitted when undefined: some OpenAI models only accept their default. */
  temperature?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** An HTTP failure carrying only the status, so provider bodies never travel. */
class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

/**
 * Chat Completions providers: OpenAI and DeepSeek (ADR-047). Same contract as
 * GeminiProvider: structured JSON in, validated AssistantResponse out.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  private readonly options: OpenAICompatibleOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.options = options;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    return parseAssistantOutput(
      await this.run(request, assistantResponseJsonSchema, "assistant_response"),
    );
  }

  async generateJson(request: JsonRequest): Promise<unknown> {
    const text = await this.run(
      { systemPrompt: request.systemPrompt, messages: [{ role: "user", content: request.prompt }] },
      request.schema,
      request.schemaName,
      request.timeoutMs,
    );
    return parseJsonText(text);
  }

  private async run(
    request: AIRequest,
    schema: unknown,
    schemaName: string,
    timeoutMs?: number,
  ): Promise<string | undefined> {
    let text: string | undefined;
    try {
      text = await withRetry(() => this.complete(request, schema, schemaName, timeoutMs), {
        retries: RETRIES,
        delayMs: (attempt) => 500 * 3 ** attempt + Math.random() * 250,
        isRetryable: isTransientHttpError,
        sleep: this.options.sleep,
      });
    } catch (error) {
      throw new AIProviderError(`${this.name} request failed`, "provider", { cause: error });
    }
    return text;
  }

  private async complete(
    request: AIRequest,
    schema: unknown,
    schemaName: string,
    timeoutMs?: number,
  ): Promise<string | undefined> {
    const { baseUrl, apiKey, model, jsonMode, temperature } = this.options;
    const system =
      jsonMode === "json_object"
        ? `${request.systemPrompt}\n\nOUTPUT FORMAT\nReply with one JSON object that matches this JSON schema:\n${JSON.stringify(schema)}`
        : request.systemPrompt;

    const body = {
      model,
      messages: [
        { role: "system", content: system },
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format:
        jsonMode === "json_schema"
          ? {
              type: "json_schema",
              json_schema: {
                name: schemaName,
                schema,
                strict: false,
              },
            }
          : { type: "json_object" },
      ...(temperature === undefined ? {} : { temperature }),
    };

    const response = await this.fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body is not read: provider errors can quote part of the key.
      throw new HttpStatusError(response.status);
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    return json.choices?.[0]?.message?.content ?? undefined;
  }
}
