import { describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { freeDefaults } from "@/lib/billing/entitlements";
import {
  ChatHistoryService,
  historyPolicy,
  InMemoryHistoryRepository,
  titleFrom,
  type HistoryPolicy,
} from "@/lib/conversation/history";
import { InMemoryConversationStore, type ConversationStore } from "@/lib/conversation/store";
import type { ChatResponse, Conversation } from "@/lib/conversation/types";
import { createChatHandler, scopedStore } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-19T12:00:00Z").getTime();

function chat(id: string, userId: string | null, daysAgo = 0) {
  return {
    id,
    userId,
    title: userId ? `Chat ${id}` : "Chat",
    updatedAt: new Date(NOW - daysAgo * DAY),
    messages: [
      { role: "user" as const, content: `Question ${id}` },
      { role: "assistant" as const, content: "Answer" },
    ],
  };
}

function setup(policy: Partial<HistoryPolicy> = {}) {
  const repo = new InMemoryHistoryRepository();
  const current: HistoryPolicy = { enabled: true, maxSaved: 3, retentionDays: 30, ...policy };
  const service = new ChatHistoryService(
    repo,
    async () => current,
    () => NOW,
  );
  return { repo, service, current };
}

describe("chat history (ADR-090)", () => {
  it("gives the free tier three saved chats kept for 30 days unused", () => {
    expect(historyPolicy(freeDefaults())).toEqual({
      enabled: true,
      maxSaved: 3,
      retentionDays: 30,
    });
  });

  it("saves new chats until the limit, then says the chat is not saved", async () => {
    const { repo, service } = setup();
    for (const id of ["a", "b", "c", "d"]) repo.add(chat(id, null));
    expect(await service.save("u1", "a")).toEqual({ saved: true });
    expect(await service.save("u1", "b")).toEqual({ saved: true });
    expect(await service.save("u1", "c")).toEqual({ saved: true });
    expect(await service.save("u1", "d")).toEqual({ saved: false, reason: "limit", max: 3 });
    // Continuing a saved chat at the limit is fine.
    expect(await service.save("u1", "a")).toEqual({ saved: true });
    expect(repo.rows.get("a")!.title).toBe("Question a");
    // After deleting one, the next chat is saved.
    expect(await service.remove("u1", "b")).toBe(true);
    expect(await service.save("u1", "d")).toEqual({ saved: true });
  });

  it("never lets one user read, delete or take over another's chat", async () => {
    const { repo, service } = setup();
    repo.add(chat("x", "owner"));
    expect(await service.open("intruder", "x")).toEqual({ ok: false, reason: "not_found" });
    expect(await service.remove("intruder", "x")).toBe(false);
    expect(await service.save("intruder", "x")).toEqual({ saved: false, reason: "unavailable" });
    expect(repo.rows.get("x")!.userId).toBe("owner");
    expect((await service.open("owner", "x")).ok).toBe(true);
  });

  it("deletes chats unused beyond the plan's retention when listing and in the daily sweep", async () => {
    const { repo, service } = setup({ retentionDays: 30 });
    repo.add(chat("fresh", "u1", 2));
    repo.add(chat("old", "u1", 31));
    repo.add(chat("other-old", "u2", 40));
    const { chats } = await service.list("u1");
    expect(chats.map((c) => c.id)).toEqual(["fresh"]);
    expect(await service.sweep()).toBe(1);
    expect(repo.rows.has("other-old")).toBe(false);
  });

  it("without history in the plan: nothing new is saved, saved chats stay listed but can't be opened", async () => {
    const { repo, service } = setup({ enabled: false });
    repo.add(chat("kept", "u1"));
    repo.add(chat("new", null));
    expect(await service.save("u1", "new")).toEqual({ saved: false, reason: "unavailable" });
    expect((await service.list("u1")).chats).toHaveLength(1);
    expect(await service.open("u1", "kept")).toEqual({ ok: false, reason: "unavailable" });
    expect(await service.remove("u1", "kept")).toBe(true);
  });

  it("applies a plan change at the next request", async () => {
    const { repo, service, current } = setup({ maxSaved: 1 });
    repo.add(chat("a", null));
    repo.add(chat("b", null));
    await service.save("u1", "a");
    expect((await service.save("u1", "b")).saved).toBe(false);
    current.maxSaved = 10; // upgraded
    expect(await service.save("u1", "b")).toEqual({ saved: true });
  });

  it("titles a chat from its first question", () => {
    expect(titleFrom("  What can I cook\nwith ₦2,000?  ")).toBe("What can I cook with ₦2,000?");
    expect(titleFrom("x".repeat(200))).toHaveLength(80);
    expect(titleFrom(undefined)).toBe("Chat");
  });
});

describe("conversation access in the chat API (ADR-090)", () => {
  const conversation = (ownerId?: string): Conversation => ({
    id: "conv-1",
    messages: [{ role: "user", content: "My child is allergic to eggs" }],
    currentIntent: "unknown",
    allergies: ["egg"],
    profile: {},
    updatedAt: Date.now(),
    ...(ownerId ? { ownerId } : {}),
  });

  it("opens a saved conversation only for its owner while their plan includes history", async () => {
    const store = new InMemoryConversationStore();
    await store.save(conversation("owner"));
    expect(await scopedStore(store, "owner", true).get("conv-1")).toBeDefined();
    expect(await scopedStore(store, "someone-else", true).get("conv-1")).toBeUndefined();
    expect(await scopedStore(store, null, true).get("conv-1")).toBeUndefined();
    expect(await scopedStore(store, "owner", false).get("conv-1")).toBeUndefined();
  });

  it("leaves guest conversations as they were", async () => {
    const store = new InMemoryConversationStore();
    await store.save(conversation());
    expect(await scopedStore(store, null, false).get("conv-1")).toBeDefined();
    expect(await scopedStore(store, "u1", true).get("conv-1")).toBeDefined();
  });
});

describe("POST /api/chat with saved chats (ADR-090)", () => {
  async function post(handler: (r: Request) => Promise<Response>, body: unknown) {
    const res = await handler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()) as ChatResponse;
  }

  it("saves a signed-in user's chat, reports the limit, and never continues another user's chat", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const store = new InMemoryConversationStore();
    const repo = new InMemoryHistoryRepository();
    // The in-memory history mirrors what the conversation store holds.
    const mirror: ConversationStore = {
      get: (id) => store.get(id),
      save: async (c) => {
        await store.save(c);
        const row = repo.rows.get(c.id);
        repo.add({
          id: c.id,
          userId: row?.userId ?? null,
          title: row?.title ?? "Chat",
          updatedAt: new Date(),
          messages: c.messages,
        });
      },
    };
    let viewer: string | null = "alice";
    const history = new ChatHistoryService(repo, async () => ({
      enabled: true,
      maxSaved: 1,
      retentionDays: 30,
    }));
    const handler = createChatHandler({
      getProvider: () => new MockProvider(),
      store: mirror,
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
      getViewer: async () => viewer,
      history,
    });

    const first = await post(handler, { message: "Hello" });
    expect(first.history).toEqual({ saved: true });
    expect(repo.rows.get(first.conversationId)!.userId).toBe("alice");
    // Mark the stored conversation as Alice's, as the database row would be.
    const saved = (await store.get(first.conversationId))!;
    await store.save({ ...saved, ownerId: "alice" });

    const second = await post(handler, { message: "A new chat" });
    expect(second.history).toEqual({ saved: false, reason: "limit", max: 1 });

    viewer = "mallory";
    const stolen = await post(handler, { conversationId: first.conversationId, message: "Hi" });
    expect(stolen.conversationId).not.toBe(first.conversationId);

    viewer = null;
    const guest = await post(handler, { message: "Hi" });
    expect(guest.history).toBeUndefined();
  });
});
