import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { getAIProvider, resetAIProviderForTests } from "@/lib/ai";
import {
  ClaudeProvider,
  DEFAULT_CLAUDE_MODEL,
  claudeSchema,
  dropEmptyOptionals,
  strictSchema,
} from "@/lib/ai/claude";
import { JSON_SCHEMA as HOSPITAL_JSON_SCHEMA } from "@/lib/hospitals/agent";
import { ASSESSMENT_JSON_SCHEMA } from "@/lib/nutritionists/analysis";
import { TURN_JSON_SCHEMA } from "@/lib/planner/intake";
import { PLANNER_CHUNK_JSON_SCHEMA } from "@/lib/planner/schema";
import { assistantResponseJsonSchema } from "@/lib/validation/chat";
import { verifyClaude } from "@/lib/ai/settings/providers";
import { AIProviderError } from "@/lib/ai/types";

const reply = { message: "Oranges are rich in vitamin C.", intent: "food_information" };

function fakeClient(create: (...args: unknown[]) => unknown) {
  return {
    beta: { messages: { create: vi.fn(create) } },
    messages: { create: vi.fn(create) },
  } as unknown as Anthropic & {
    beta: { messages: { create: ReturnType<typeof vi.fn> } };
    messages: { create: ReturnType<typeof vi.fn> };
  };
}

const message = (overrides: Partial<Anthropic.Beta.BetaMessage> = {}) =>
  ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(reply) }],
    ...overrides,
  }) as Anthropic.Beta.BetaMessage;

const request = {
  systemPrompt: "SYSTEM",
  messages: [
    { role: "assistant" as const, content: "Earlier reply cut from a long history" },
    { role: "user" as const, content: "Hi" },
    { role: "assistant" as const, content: "Hello" },
    { role: "user" as const, content: "Oranges?" },
  ],
};

describe("ClaudeProvider (ADR-059)", () => {
  it("sends the layered prompt, the conversation and the reply schema as structured output", async () => {
    const client = fakeClient(async () => message());
    const provider = new ClaudeProvider("sk-ant-test", { client });
    expect(await provider.generateResponse(request)).toEqual(reply);

    const params = client.beta.messages.create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: DEFAULT_CLAUDE_MODEL,
      system: "SYSTEM",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    // The API needs a user turn first; a trimmed history may start otherwise.
    expect(params.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Oranges?" },
    ]);
    const schema = params.output_config.format.schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.profileUpdate.additionalProperties).toBe(false);
    expect(schema.properties.mealPlan.properties.days.items.additionalProperties).toBe(false);
  });

  it("uses the configured model", async () => {
    const client = fakeClient(async () => message());
    await new ClaudeProvider("sk-ant-test", {
      client,
      model: "claude-sonnet-5-5",
    }).generateResponse(request);
    expect(client.beta.messages.create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
  });

  it("fails cleanly on a refusal, a cut-off reply and an API error", async () => {
    const refused = new ClaudeProvider("k", {
      client: fakeClient(async () => message({ stop_reason: "refusal", content: [] })),
    });
    await expect(refused.generateResponse(request)).rejects.toMatchObject({ category: "provider" });

    const cut = new ClaudeProvider("k", {
      client: fakeClient(async () => message({ stop_reason: "max_tokens" })),
    });
    await expect(cut.generateResponse(request)).rejects.toMatchObject({
      category: "invalid_output",
    });

    const failing = new ClaudeProvider("k", {
      client: fakeClient(async () => {
        throw new Anthropic.RateLimitError(429, undefined, "slow down", new Headers());
      }),
    });
    const error = await failing.generateResponse(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as { cause: { status: number } }).cause.status).toBe(429);
  });

  it("retries without server-side fallbacks when the API rejects them, then stops sending them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const client = fakeClient(async (params) => {
      calls++;
      if ((params as { fallbacks?: unknown }).fallbacks) {
        throw new Anthropic.BadRequestError(
          400,
          {
            error: {
              type: "invalid_request_error",
              message: "fallbacks: Extra inputs are not permitted",
            },
          },
          "fallbacks",
          new Headers(),
        );
      }
      return message();
    });
    const provider = new ClaudeProvider("k", { client });
    expect((await provider.generateResponse(request)).message).toBe(reply.message);
    await provider.generateResponse(request);
    expect(calls).toBe(3);
    const sent = client.beta.messages.create.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(sent[0]!.fallbacks).toBe("default");
    expect(sent[1]!.fallbacks).toBeUndefined();
    expect(sent[1]!.betas).toBeUndefined();
    expect(sent[2]!.fallbacks).toBeUndefined();
  });

  it("logs the API's status and reason, never the conversation", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new ClaudeProvider("k", {
      client: fakeClient(async () => {
        throw new Anthropic.BadRequestError(
          400,
          {
            error: {
              type: "invalid_request_error",
              message: "max_tokens: too large for this model",
            },
          },
          "bad",
          new Headers(),
        );
      }),
    });
    const error = await provider.generateResponse(request).catch((e: unknown) => e);
    expect((error as { cause: { status: number } }).cause.status).toBe(400);
    const line = log.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("claude_request_failed"))!;
    expect(JSON.parse(line)).toMatchObject({
      status: 400,
      detail: "invalid_request_error: max_tokens: too large for this model",
    });
    expect(line).not.toContain("Oranges");
  });

  it("is selected with AI_PROVIDER=claude and CLAUDE_API_KEY", () => {
    resetAIProviderForTests();
    expect(getAIProvider({ AI_PROVIDER: "claude", CLAUDE_API_KEY: "sk-ant-x" }).name).toBe(
      "claude",
    );
    resetAIProviderForTests();
    expect(() => getAIProvider({ AI_PROVIDER: "claude" })).toThrow(/CLAUDE_API_KEY/);
    resetAIProviderForTests();
  });
});

describe("strictSchema", () => {
  it("closes every object without touching anything else", () => {
    expect(
      strictSchema({
        type: "object",
        properties: {
          list: {
            type: "array",
            items: { type: "object", properties: { a: { type: "string", enum: ["x"] } } },
          },
        },
        required: ["list"],
      }),
    ).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["list"],
      properties: {
        list: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { a: { type: "string", enum: ["x"] } },
          },
        },
      },
    });
  });
});

describe("verifyClaude", () => {
  it("accepts a working key with one request shaped exactly like a chat reply", async () => {
    const client = fakeClient(async () => message());
    expect(await verifyClaude("sk-ant-x", "claude-opus-5-5", client)).toEqual({ ok: true });
    expect(client.beta.messages.create.mock.calls[0][0]).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
  });

  it("fails verification when the chat request itself is rejected", async () => {
    const client = fakeClient(async () => {
      throw new Anthropic.BadRequestError(
        400,
        {
          error: {
            type: "invalid_request_error",
            message: "output_config.format: schema not supported",
          },
        },
        "schema not supported",
        new Headers(),
      );
    });
    expect(await verifyClaude("sk-ant-x", "claude-opus-5-5", client)).toEqual({
      ok: false,
      reason: "model_unavailable",
    });
  });

  it.each([
    [new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()), "invalid_key"],
    [new Anthropic.NotFoundError(404, undefined, "no model", new Headers()), "model_unavailable"],
    [new Anthropic.RateLimitError(429, undefined, "slow", new Headers()), "rate_limited"],
    [
      new Anthropic.BadRequestError(
        400,
        undefined,
        "Your credit balance is too low",
        new Headers(),
      ),
      "no_credit",
    ],
    [new Anthropic.InternalServerError(500, undefined, "oops", new Headers()), "unreachable"],
  ])("classifies %s", async (error, reason) => {
    const client = fakeClient(async () => {
      throw error;
    });
    expect(await verifyClaude("sk-ant-x", "claude-opus-5-5", client)).toEqual({
      ok: false,
      reason,
    });
  });
});

/** Counts what the API limits: optional properties and union-typed properties. */
function countLimits(node: unknown, acc = { optional: 0, unions: 0 }) {
  if (Array.isArray(node)) node.forEach((n) => countLimits(n, acc));
  if (!node || typeof node !== "object") return acc;
  const n = node as Record<string, unknown>;
  if (n.properties && typeof n.properties === "object") {
    const required = new Set((n.required as string[]) ?? []);
    for (const [k, v] of Object.entries(n.properties)) {
      if (!required.has(k)) acc.optional++;
      const p = v as Record<string, unknown>;
      if (p.anyOf || Array.isArray(p.type)) acc.unions++;
      countLimits(v, acc);
    }
  }
  if (n.items) countLimits(n.items, acc);
  if (n.anyOf) countLimits(n.anyOf, acc);
  return acc;
}

describe("Claude structured-output limits", () => {
  it.each([
    ["chat reply", assistantResponseJsonSchema],
    ["hospital agent", HOSPITAL_JSON_SCHEMA],
    ["nutritionist assessment", ASSESSMENT_JSON_SCHEMA],
    ["planner intake", TURN_JSON_SCHEMA],
    ["planner chunk", PLANNER_CHUNK_JSON_SCHEMA],
  ])("keeps the %s schema within 24 optional and 16 union properties", (_, schema) => {
    const { optional, unions } = countLimits(claudeSchema(schema));
    expect(optional).toBeLessThanOrEqual(24);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it("drops empty optional text and lists, keeping required ones and real values", () => {
    const out = dropEmptyOptionals(
      {
        message: "Hi",
        intent: "general_nutrition",
        englishMessage: "",
        followUpQuestion: "",
        safetyNotice: "",
        recommendedFoods: [],
        shoppingList: [{ item: "rice", quantity: 1, forMeal: "" }],
        fromHome: ["beans"],
        profileUpdate: { allergies: [], state: "", pregnant: true },
      },
      assistantResponseJsonSchema,
    );
    expect(out).toEqual({
      message: "Hi",
      intent: "general_nutrition",
      shoppingList: [{ item: "rice", quantity: 1 }],
      fromHome: ["beans"],
      profileUpdate: { pregnant: true },
    });
  });

  it("parses a chat reply that fills every forced field with empty values", async () => {
    const client = fakeClient(async () =>
      message({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Oranges are rich in vitamin C.",
              intent: "food_information",
              englishMessage: "",
              followUpQuestion: "",
              safetyNotice: "",
              recommendedFoods: [],
              shoppingList: [],
              fromHome: [],
            }),
          } as Anthropic.Beta.BetaTextBlock,
        ],
      }),
    );
    const reply = await new ClaudeProvider("k", { client }).generateResponse(request);
    expect(reply).toEqual({
      message: "Oranges are rich in vitamin C.",
      intent: "food_information",
    });
    const sent = client.beta.messages.create.mock.calls[0]![0] as {
      output_config: { format: { schema: { required: string[] } } };
    };
    expect(sent.output_config.format.schema.required).toEqual(
      expect.arrayContaining(["message", "intent", "followUpQuestion", "shoppingList"]),
    );
  });
});
