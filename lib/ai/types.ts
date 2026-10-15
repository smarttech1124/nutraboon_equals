import type { AssistantResponse, ChatMessage } from "@/lib/conversation/types";

export type AIRequest = {
  /** Layered system prompt built by lib/ai/prompts.ts. */
  systemPrompt: string;
  /** Prior turns plus the current user message as the last entry. */
  messages: ChatMessage[];
};

export type AIResponse = AssistantResponse;

/**
 * A one-off structured task outside chat, e.g. nutritionist qualification
 * analysis (ADR-064). The caller validates the result: providers only parse JSON.
 */
export type JsonRequest = {
  systemPrompt: string;
  prompt: string;
  /** JSON schema of the expected object. */
  schema: Record<string, unknown>;
  /** Short identifier, e.g. "qualification_analysis". */
  schemaName: string;
  /** Per-request time limit for long outputs (e.g. a day of recipes); providers default otherwise. */
  timeoutMs?: number;
};

export interface AIProvider {
  readonly name: string;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  /** Optional: providers without structured output (mock, XEELAA) leave it out. */
  generateJson?(request: JsonRequest): Promise<unknown>;
}

/** Parses provider JSON text, as an AIProviderError when it is empty or not JSON. */
export function parseJsonText(text: string | undefined): unknown {
  if (!text) throw new AIProviderError("Empty response from provider", "invalid_output");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AIProviderError("Provider returned non-JSON output", "invalid_output", {
      cause: error,
    });
  }
}

/** Raised for any provider failure. Its message is internal and never shown to users. */
export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly category: "config" | "network" | "invalid_output" | "provider",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AIProviderError";
  }
}
