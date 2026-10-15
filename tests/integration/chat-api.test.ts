import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { AIProviderError, type AIProvider, type AIRequest } from "@/lib/ai/types";
import { ConversationStoreError, InMemoryConversationStore } from "@/lib/conversation/store";
import { AI_UNAVAILABLE_MESSAGE, createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter, RateLimitUnavailableError } from "@/lib/http/rate-limit";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  let store: InMemoryConversationStore;
  let provider: AIProvider;
  let POST: (req: Request) => Promise<Response>;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    store = new InMemoryConversationStore();
    provider = new MockProvider();
    POST = createChatHandler({
      getProvider: () => provider,
      store,
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });
  });

  it("starts a conversation and returns the structured reply", async () => {
    const res = await POST(post({ message: "I have ₦2,000. What can I cook?" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();

    const body = await res.json();
    expect(body.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.intent).toBe("budget_planning");
    expect(body.message).toMatch(/already have at home/);
  });

  it("sends prior turns to the provider when continuing a conversation", async () => {
    const seen: AIRequest[] = [];
    provider = {
      name: "spy",
      generateResponse: async (req) => {
        seen.push(req);
        return { message: "ok", intent: "meal_planning" };
      },
    };

    const first = await (await POST(post({ message: "Plan meals for my family" }))).json();
    await POST(post({ conversationId: first.conversationId, message: "Four people" }));

    expect(seen[1].messages).toEqual([
      { role: "user", content: "Plan meals for my family" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Four people" },
    ]);
  });

  it("starts a fresh conversation when the id is unknown or expired", async () => {
    const res = await POST(
      post({ conversationId: "00000000-0000-4000-8000-000000000000", message: "hello" }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.conversationId).not.toBe("00000000-0000-4000-8000-000000000000");
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["empty message", { message: "" }],
    ["missing message", {}],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("returns 413 for oversized bodies", async () => {
    const res = await POST(post({ message: "a".repeat(10_000) }));
    expect(res.status).toBe(413);
  });

  it("returns a safe 503 when the provider fails, without leaking details", async () => {
    provider = {
      name: "broken",
      generateResponse: async () => {
        throw new AIProviderError("upstream 500: secret-key-abc quota", "provider");
      },
    };
    const res = await POST(post({ message: "hello" }));
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text).error.message).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(text).not.toContain("secret-key-abc");
    expect(text).not.toContain("upstream");
  });

  it("returns a safe 500 for unexpected errors", async () => {
    provider = {
      name: "buggy",
      generateResponse: async () => {
        throw new TypeError("cannot read properties of undefined");
      },
    };
    const res = await POST(post({ message: "hello" }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("undefined");
  });

  it("does not persist the user message when the provider fails, so retry is clean", async () => {
    const seen: AIRequest[] = [];
    let fail = false;
    provider = {
      name: "flaky",
      generateResponse: async (req) => {
        seen.push(req);
        if (fail) throw new AIProviderError("down", "network");
        return { message: "ok", intent: "unknown" };
      },
    };

    const { conversationId } = await (await POST(post({ message: "first" }))).json();
    fail = true;
    await POST(post({ conversationId, message: "second" }));
    fail = false;
    await POST(post({ conversationId, message: "second" }));

    expect(seen.at(-1)!.messages.map((m) => m.content)).toEqual(["first", "ok", "second"]);
  });

  it("does not log message content", async () => {
    const info = vi.spyOn(console, "info");
    await POST(post({ message: "my private health detail" }));
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).toContain('"outcome":"success"');
    expect(logged).not.toContain("private health detail");
  });

  it("rate limits per client", async () => {
    POST = createChatHandler({
      getProvider: () => provider,
      store,
      rateLimiter: new InMemoryRateLimiter(1, 60_000),
    });
    const headers = { "x-forwarded-for": "1.2.3.4" };
    expect((await POST(post({ message: "a" }, headers))).status).toBe(200);
    const limited = await POST(post({ message: "b" }, headers));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/chat when the conversation store fails", () => {
  it("answers 503 with the friendly message and never calls the model without saved facts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error");
    const generate = vi.fn();
    const POST = createChatHandler({
      getProvider: () => ({ name: "spy", generateResponse: generate }),
      store: {
        get: async () => {
          throw new ConversationStoreError("db down: password=secret");
        },
        save: async () => {},
      },
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });

    const res = await POST(
      post({ conversationId: "00000000-0000-4000-8000-000000000000", message: "Snack ideas?" }),
    );
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text).error.message).toBe(AI_UNAVAILABLE_MESSAGE);
    expect(text).not.toContain("secret");
    expect(generate).not.toHaveBeenCalled();
    expect(errors.mock.calls.flat().join(" ")).toContain('"errorCategory":"store_unavailable"');
  });

  it("fails the turn when saving fails, so the user can retry cleanly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const POST = createChatHandler({
      getProvider: () => new MockProvider(),
      store: {
        get: async () => undefined,
        save: async () => {
          throw new ConversationStoreError("db down");
        },
      },
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });
    const res = await POST(post({ message: "My son is allergic to peanuts." }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/chat when the rate limiter fails", () => {
  it("lets the request through and logs the degraded limiter", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const POST = createChatHandler({
      getProvider: () => new MockProvider(),
      store: new InMemoryConversationStore(),
      rateLimiter: {
        check: async () => {
          throw new RateLimitUnavailableError("db down");
        },
      },
    });
    const res = await POST(post({ message: "hello" }));

    expect(res.status).toBe(200);
    expect(info.mock.calls.flat().join(" ")).toContain('"degraded":["rate_limit_unavailable"]');
  });
});
