import { describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { createProvider, verifyCredential } from "@/lib/ai/settings/providers";
import { AIProviderError } from "@/lib/ai/types";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";

const KEY = "sk-0123456789abcdef0123456789abcdef";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (body: string, status: number) => new Response(body, { status });

describe("verifyCredential", () => {
  it("sends one tiny OpenAI request with the key in the header, not the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ choices: [] }));
    expect(await verifyCredential("openai", KEY, "gpt-test", fetchMock)).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(String(url)).not.toContain(KEY);
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-test",
      messages: [{ role: "user", content: "ping" }],
      max_completion_tokens: 16,
    });
  });

  it("uses DeepSeek's endpoint with a one-token reply", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}));
    await verifyCredential("deepseek", KEY, "deepseek-chat", fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "deepseek-chat", max_tokens: 1 });
  });

  it("uses Gemini's generateContent with the key in x-goog-api-key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}));
    await verifyCredential(
      "gemini",
      "AIzaSyD-0123456789abcdefghijklmnopqrs",
      "gemini-3.8-flash",
      fetchMock,
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(init?.headers).toMatchObject({
      "x-goog-api-key": "AIzaSyD-0123456789abcdefghijklmnopqrs",
    });
    expect(JSON.parse(String(init?.body)).generationConfig).toEqual({ maxOutputTokens: 1 });
  });

  it.each([
    ["openai", 401, "", "invalid_key"],
    ["openai", 404, "", "model_unavailable"],
    ["openai", 429, '{"error":{"code":"insufficient_quota"}}', "no_credit"],
    ["openai", 429, "slow down", "rate_limited"],
    ["openai", 403, "", "rejected"],
    ["deepseek", 402, "", "no_credit"],
    ["deepseek", 400, '{"error":{"message":"Model Not Exist"}}', "model_unavailable"],
    ["gemini", 400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', "invalid_key"],
    ["gemini", 403, "", "invalid_key"],
    ["gemini", 503, "", "unreachable"],
    ["gemini", 418, "", "rejected"],
  ] as const)("classifies %s HTTP %i (%s) as %s", async (provider, status, body, reason) => {
    const fetchMock = vi.fn<typeof fetch>(async () => text(body, status));
    expect(await verifyCredential(provider, KEY, "m", fetchMock)).toEqual({ ok: false, reason });
  });

  it("reports a network failure as unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyCredential("openai", KEY, "m", fetchMock)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("OpenAICompatibleProvider", () => {
  const request = {
    systemPrompt: "SYSTEM",
    messages: [
      { role: "user" as const, content: "Hi" },
      { role: "assistant" as const, content: "Hello" },
      { role: "user" as const, content: "Oranges?" },
    ],
  };
  const reply = { message: "Oranges are rich in vitamin C.", intent: "food_information" };

  it("sends OpenAI structured output and returns the validated reply", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: KEY,
      model: "gpt-test",
      jsonMode: "json_schema",
      fetch: fetchMock,
    });

    expect(await provider.generateResponse(request)).toEqual(reply);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Oranges?" },
    ]);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "assistant_response",
        schema: assistantResponseJsonSchema,
        strict: false,
      },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("puts the schema in the prompt for DeepSeek's JSON mode", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: KEY,
      model: "deepseek-chat",
      jsonMode: "json_object",
      temperature: 0.4,
      fetch: fetchMock,
    });
    await provider.generateResponse(request);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0.4);
    expect(body.messages[0].content).toMatch(/^SYSTEM\n\nOUTPUT FORMAT\n[\s\S]*JSON schema/);
  });

  it("retries overload errors, then fails without the provider's error body", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      text(`{"error":"Incorrect API key provided: ${KEY.slice(0, 6)}***"}`, 503),
    );
    const provider = new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: KEY,
      model: "gpt-test",
      jsonMode: "json_schema",
      fetch: fetchMock,
      sleep: async () => {},
    });
    const error = await provider.generateResponse(request).catch((e: unknown) => e);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(AIProviderError);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain("Incorrect");
  });

  it("does not retry a rejected key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => text("", 401));
    const provider = new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: KEY,
      model: "gpt-test",
      jsonMode: "json_schema",
      fetch: fetchMock,
      sleep: async () => {},
    });
    await expect(provider.generateResponse(request)).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("createProvider", () => {
  it("builds the matching provider", () => {
    expect(createProvider("gemini", "AIzaSyD-0123456789abcdefghijklmnopqrs", "g")).toBeInstanceOf(
      GeminiProvider,
    );
    expect(createProvider("openai", KEY, "gpt").name).toBe("openai");
    expect(createProvider("deepseek", KEY, "deepseek-chat").name).toBe("deepseek");
  });
});
