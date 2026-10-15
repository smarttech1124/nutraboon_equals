import { afterEach, describe, expect, it } from "vitest";
import { getAIProvider, resetAIProviderForTests } from "@/lib/ai";
import { parseAssistantOutput } from "@/lib/ai/parse";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { AIProviderError } from "@/lib/ai/types";

describe("parseAssistantOutput", () => {
  it("accepts valid structured output", () => {
    const result = parseAssistantOutput(
      JSON.stringify({ message: "Hello", intent: "food_information" }),
    );
    expect(result).toEqual({ message: "Hello", intent: "food_information" });
  });

  it("maps an unknown intent to 'unknown' instead of failing", () => {
    const result = parseAssistantOutput(JSON.stringify({ message: "Hi", intent: "chit_chat" }));
    expect(result.intent).toBe("unknown");
  });

  it.each([
    ["empty output", undefined],
    ["non-JSON output", "Sure! Oranges are great."],
    ["missing message", JSON.stringify({ intent: "unknown" })],
    ["blank message", JSON.stringify({ message: "  ", intent: "unknown" })],
  ])("rejects %s", (_label, text) => {
    expect(() => parseAssistantOutput(text)).toThrow(AIProviderError);
  });
});

describe("buildSystemPrompt", () => {
  it("includes every policy layer and marks absent verified data", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("You are Nutraboom Equals");
    expect(prompt).toContain("Safety rules");
    expect(prompt).toContain("Data rules");
    expect(prompt).toContain("Conversation rules");
    expect(prompt).toContain("VERIFIED DATA: none available");
  });

  it("injects verified data lines when provided", () => {
    const prompt = buildSystemPrompt({ verifiedData: ["Orange, 1 medium: 62 kcal (USDA)"] });
    expect(prompt).toContain("VERIFIED DATA:\n- Orange, 1 medium: 62 kcal (USDA)");
  });
});

describe("getAIProvider", () => {
  afterEach(() => resetAIProviderForTests());

  it("returns the mock provider when configured", () => {
    expect(getAIProvider({ AI_PROVIDER: "mock" }).name).toBe("mock");
  });

  it("returns Gemini when a key is present", () => {
    const env = { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" };
    expect(getAIProvider(env).name).toBe("gemini");
  });

  it("fails with a config error when the Gemini key is missing", () => {
    expect(() => getAIProvider({ AI_PROVIDER: "gemini" })).toThrow(
      expect.objectContaining({ category: "config" }),
    );
  });

  it("rejects an unknown provider name", () => {
    expect(() => getAIProvider({ AI_PROVIDER: "nope" })).toThrow(AIProviderError);
  });
});

describe("getAIProvider fallback config", () => {
  afterEach(() => resetAIProviderForTests());

  it("passes GEMINI_FALLBACK_MODEL to the Gemini provider", () => {
    const provider = getAIProvider({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "k",
      GEMINI_FALLBACK_MODEL: "gemini-backup",
    }) as unknown as { fallbackModel?: string };
    expect(provider.fallbackModel).toBe("gemini-backup");
  });
});
