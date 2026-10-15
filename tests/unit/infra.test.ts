import { describe, expect, it } from "vitest";
import {
  CONVERSATION_TTL_MS,
  InMemoryConversationStore,
  MAX_STORED_MESSAGES,
} from "@/lib/conversation/store";
import { decide, InMemoryRateLimiter, windowStartOf } from "@/lib/http/rate-limit";
import { chatRequestSchema, MAX_MESSAGE_LENGTH } from "@/lib/validation/chat";

const conversation = (messages: { role: "user" | "assistant"; content: string }[] = []) => ({
  id: "a",
  messages,
  currentIntent: "unknown" as const,
  allergies: [],
  profile: {},
  updatedAt: 0,
});

describe("InMemoryConversationStore", () => {
  it("expires conversations after the TTL", async () => {
    let now = 0;
    const store = new InMemoryConversationStore(() => now);
    await store.save(conversation());

    now = CONVERSATION_TTL_MS - 1;
    expect(await store.get("a")).toBeDefined();
    now = CONVERSATION_TTL_MS * 2;
    expect(await store.get("a")).toBeUndefined();
  });

  it("keeps only the most recent messages", async () => {
    const store = new InMemoryConversationStore();
    const messages = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));
    await store.save(conversation(messages));

    const saved = (await store.get("a"))!;
    expect(saved.messages).toHaveLength(MAX_STORED_MESSAGES);
    expect(saved.messages.at(-1)?.content).toBe(`m${MAX_STORED_MESSAGES + 4}`);
  });
});

describe("InMemoryRateLimiter", () => {
  it("blocks after the limit and resets with the next window", async () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(2, 1000, () => now);

    expect((await limiter.check("ip")).allowed).toBe(true);
    expect((await limiter.check("ip")).allowed).toBe(true);
    expect(await limiter.check("ip")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect((await limiter.check("other-ip")).allowed).toBe(true);

    now = 1000;
    expect((await limiter.check("ip")).allowed).toBe(true);
  });

  it("aligns windows to the clock and reports the wait until the next one", async () => {
    let now = 61_500; // inside the window 60_000–119_999
    const limiter = new InMemoryRateLimiter(1, 60_000, () => now);
    expect((await limiter.check("ip")).allowed).toBe(true);
    expect(await limiter.check("ip")).toEqual({ allowed: false, retryAfterSeconds: 59 });

    now = 120_000; // next aligned window
    expect((await limiter.check("ip")).allowed).toBe(true);
  });
});

describe("windowStartOf / decide", () => {
  it("rounds down to the window and allows up to the limit", () => {
    expect(windowStartOf(119_999, 60_000)).toBe(60_000);
    expect(decide(20, 20, 0, 60_000, 30_000)).toEqual({ allowed: true });
    expect(decide(21, 20, 0, 60_000, 30_000)).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });
});

describe("chatRequestSchema", () => {
  it("trims the message and accepts a missing conversationId", () => {
    expect(chatRequestSchema.parse({ message: "  hi  " })).toEqual({ message: "hi" });
  });

  it.each([
    ["empty message", { message: "   " }],
    ["overlong message", { message: "a".repeat(MAX_MESSAGE_LENGTH + 1) }],
    ["non-UUID conversationId", { message: "hi", conversationId: "abc" }],
    ["non-string message", { message: 42 }],
  ])("rejects %s", (_label, body) => {
    expect(chatRequestSchema.safeParse(body).success).toBe(false);
  });
});
