import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { AIProviderError, type AIProvider } from "./types";

export type { AIProvider, AIRequest, AIResponse } from "./types";
export { AIProviderError } from "./types";

let cached: AIProvider | undefined;

/**
 * Returns the provider selected by AI_PROVIDER. To add a provider, implement
 * AIProvider in its own file and add a case here (ADR-013, ADR-020).
 */
export function getAIProvider(env: Record<string, string | undefined> = process.env): AIProvider {
  if (cached) return cached;

  const name = (env.AI_PROVIDER ?? "gemini").toLowerCase();
  switch (name) {
    case "gemini": {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError("GEMINI_API_KEY is not set", "config");
      }
      cached = new GeminiProvider(apiKey, {
        model: env.GEMINI_MODEL || undefined,
        fallbackModel: env.GEMINI_FALLBACK_MODEL || undefined,
      });
      break;
    }
    case "claude": {
      // CLAUDE_API_KEY per the platform spec; ANTHROPIC_API_KEY also works.
      const apiKey = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AIProviderError("CLAUDE_API_KEY is not set", "config");
      }
      cached = new ClaudeProvider(apiKey, { model: env.CLAUDE_MODEL || undefined });
      break;
    }
    case "mock":
      cached = new MockProvider();
      break;
    default:
      throw new AIProviderError(`Unknown AI_PROVIDER "${name}"`, "config");
  }
  return cached;
}

/** Test hook: clears the cached provider so a new env can be applied. */
export function resetAIProviderForTests(): void {
  cached = undefined;
}
