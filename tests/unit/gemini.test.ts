import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the Google SDK with a fake so no network call is made.
const generateContent = vi.fn();
const constructorArgs: unknown[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(options: unknown) {
      constructorArgs.push(options);
    }
  },
}));

const { GeminiProvider, DEFAULT_GEMINI_MODEL, PRIMARY_COOLDOWN_MS, resetGeminiCooldownForTests } =
  await import("@/lib/ai/gemini");
const { AIProviderError } = await import("@/lib/ai/types");
const { assistantResponseJsonSchema } = await import("@/lib/validation/chat");

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const ok = (body: object) => ({ text: JSON.stringify(body) });
const noSleep = async () => {};

describe("GeminiProvider", () => {
  beforeEach(() => {
    generateContent.mockReset();
    constructorArgs.length = 0;
  });

  it("sends the conversation with Gemini roles, the system prompt and the JSON schema", async () => {
    generateContent.mockResolvedValueOnce(ok({ message: "Hello", intent: "general_nutrition" }));
    const provider = new GeminiProvider("test-key", { sleep: noSleep });

    const reply = await provider.generateResponse({
      systemPrompt: "SYSTEM",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "Oranges?" },
      ],
    });

    expect(reply).toEqual({ message: "Hello", intent: "general_nutrition" });
    expect(constructorArgs[0]).toMatchObject({
      apiKey: "test-key",
      httpOptions: { timeout: 20_000 },
    });
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(request.contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello!" }] },
      { role: "user", parts: [{ text: "Oranges?" }] },
    ]);
    expect(request.config).toMatchObject({
      systemInstruction: "SYSTEM",
      responseMimeType: "application/json",
      responseJsonSchema: assistantResponseJsonSchema,
    });
  });

  it("uses the configured model", async () => {
    generateContent.mockResolvedValueOnce(ok({ message: "x", intent: "unknown" }));
    await new GeminiProvider("k", { model: "gemini-test-model", sleep: noSleep }).generateResponse({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-test-model");
  });

  it("retries an overloaded model and returns the eventual answer", async () => {
    generateContent
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(ok({ message: "Back", intent: "unknown" }));
    const reply = await new GeminiProvider("k", { sleep: noSleep }).generateResponse({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(reply.message).toBe("Back");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("wraps a failure in AIProviderError without retrying bad requests", async () => {
    generateContent.mockRejectedValue(httpError(400));
    await expect(
      new GeminiProvider("k", { sleep: noSleep }).generateResponse({
        systemPrompt: "",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toMatchObject({ name: "AIProviderError", category: "provider" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects output that is not valid structured JSON", async () => {
    generateContent.mockResolvedValueOnce({ text: "Sure! Oranges are great." });
    await expect(
      new GeminiProvider("k", { sleep: noSleep }).generateResponse({
        systemPrompt: "",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
  });
});

describe("GeminiProvider fallback model", () => {
  const request = { systemPrompt: "", messages: [{ role: "user" as const, content: "hi" }] };
  const modelsCalled = () => generateContent.mock.calls.map((c) => c[0].model);

  beforeEach(() => {
    generateContent.mockReset();
    resetGeminiCooldownForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("goes straight to the fallback for a minute after the primary failed over", async () => {
    generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === "primary") throw httpError(503);
      return ok({ message: "From backup", intent: "unknown" });
    });
    let now = 1_000_000;
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
      now: () => now,
    });
    await provider.generateResponse(request);
    generateContent.mockClear();
    await provider.generateResponse(request);
    expect(modelsCalled()).toEqual(["backup"]);
    now += PRIMARY_COOLDOWN_MS + 1;
    generateContent.mockClear();
    await provider.generateResponse(request);
    expect(modelsCalled()[0]).toBe("primary");
  });

  it("answers from the fallback when the primary stays overloaded after its retries", async () => {
    generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === "primary") throw httpError(503);
      return ok({ message: "From backup", intent: "unknown" });
    });
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    });

    const reply = await provider.generateResponse(request);
    expect(reply.message).toBe("From backup");
    expect(modelsCalled()).toEqual(["primary", "primary", "primary", "backup"]);
  });

  it.each([429, 404, 500])("falls back when the primary keeps returning %d", async (status) => {
    generateContent.mockImplementation(async ({ model }: { model: string }) => {
      if (model === "primary") throw httpError(status);
      return ok({ message: "From backup", intent: "unknown" });
    });
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    });
    expect((await provider.generateResponse(request)).message).toBe("From backup");
    expect(modelsCalled().at(-1)).toBe("backup");
  });

  it("does not need the fallback when a retry on the primary succeeds", async () => {
    generateContent
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue(ok({ message: "From primary", intent: "unknown" }));
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    });
    expect((await provider.generateResponse(request)).message).toBe("From primary");
    expect(modelsCalled()).toEqual(["primary", "primary"]);
  });

  it.each([400, 401, 403])(
    "does not fall back on a %d, which any model would hit",
    async (status) => {
      generateContent.mockRejectedValue(httpError(status));
      const provider = new GeminiProvider("k", {
        model: "primary",
        fallbackModel: "backup",
        sleep: noSleep,
      });
      await expect(provider.generateResponse(request)).rejects.toBeInstanceOf(AIProviderError);
      expect(modelsCalled()).toEqual(["primary"]);
    },
  );

  it("falls back after a timeout or network error (no HTTP status)", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue(ok({ message: "From backup", intent: "unknown" }));
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    });
    expect((await provider.generateResponse(request)).message).toBe("From backup");
  });

  it("skips the fallback when the primary used up too much of the time limit", async () => {
    let t = 0;
    generateContent.mockImplementation(async () => {
      t += 20_000; // each attempt "takes" 20 s
      throw httpError(503);
    });
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
      now: () => t,
    });
    await expect(provider.generateResponse(request)).rejects.toBeInstanceOf(AIProviderError);
    expect(modelsCalled()).not.toContain("backup");
  });

  it("is off when no fallback is set, or when it equals the primary", async () => {
    generateContent.mockRejectedValue(httpError(503));
    await expect(
      new GeminiProvider("k", { model: "primary", sleep: noSleep }).generateResponse(request),
    ).rejects.toBeInstanceOf(AIProviderError);
    await expect(
      new GeminiProvider("k", {
        model: "primary",
        fallbackModel: "primary",
        sleep: noSleep,
      }).generateResponse(request),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(modelsCalled().every((m) => m === "primary")).toBe(true);
  });

  it("logs the switch with model names and status only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValue(ok({ message: "ok", intent: "unknown" }));
    await new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    }).generateResponse({
      systemPrompt: "SECRET PROMPT",
      messages: [{ role: "user", content: "my private health detail" }],
    });
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).toBe('{"event":"ai_fallback","from":"primary","to":"backup","status":429}');
  });

  it("reports a provider error when the fallback fails too", async () => {
    generateContent.mockRejectedValue(httpError(503));
    const provider = new GeminiProvider("k", {
      model: "primary",
      fallbackModel: "backup",
      sleep: noSleep,
    });
    await expect(provider.generateResponse(request)).rejects.toMatchObject({
      name: "AIProviderError",
      category: "provider",
    });
    expect(modelsCalled().filter((m) => m === "backup")).toHaveLength(3); // backup also retried
  });
});
