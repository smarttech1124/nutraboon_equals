import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "@/lib/ai/claude";
import { FallbackProvider } from "@/lib/ai/fallback";
import { MockProvider } from "@/lib/ai/mock";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { AIProviderError, type AIProvider } from "@/lib/ai/types";

/** Structured back-office calls (ADR-064): same providers, any schema, caller validates. */

const jsonRequest = {
  systemPrompt: "SYSTEM",
  prompt: "Assess this.",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  schemaName: "test_schema",
};

describe("generateJson", () => {
  it("Claude sends the given schema, made strict, and parses the JSON", async () => {
    const create = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"ok":true}' }],
    }));
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const provider = new ClaudeProvider("sk-ant-test", { client });
    expect(await provider.generateJson(jsonRequest)).toEqual({ ok: true });
    const params = (create.mock.calls[0] as unknown[])[0] as {
      system: string;
      messages: unknown[];
      output_config: { format: { schema: Record<string, unknown> } };
    };
    expect(params.system).toBe("SYSTEM");
    expect(params.messages).toEqual([{ role: "user", content: "Assess this." }]);
    expect(params.output_config.format.schema.additionalProperties).toBe(false);
  });

  it("OpenAI-compatible providers name the schema and report non-JSON as invalid output", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ choices: [{ message: { content: "not json" } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.example.test/v1",
      apiKey: "sk-test",
      model: "m",
      jsonMode: "json_schema",
      fetch: fetchMock,
    });
    await expect(provider.generateJson(jsonRequest)).rejects.toBeInstanceOf(AIProviderError);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format.json_schema.name).toBe("test_schema");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Assess this." });
  });

  it("a fallback chain uses the side that supports structured output", async () => {
    const structured: AIProvider = {
      name: "structured",
      generateResponse: vi.fn(),
      generateJson: vi.fn(async () => ({ ok: true })),
    };
    const chatOnly = new MockProvider();
    const chain = new FallbackProvider(chatOnly, structured, { state: { skipUntil: 0 } });
    expect(await chain.generateJson!(jsonRequest)).toEqual({ ok: true });
    expect(
      new FallbackProvider(chatOnly, chatOnly, { state: { skipUntil: 0 } }).generateJson,
    ).toBeUndefined();
  });
});
