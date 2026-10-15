import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore, type ConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

/**
 * On Vercel, consecutive messages can reach different server instances. All
 * conversation state must therefore live in the shared store, never in the
 * handler (ADR-039). Two handlers sharing one store stand in for two instances.
 */
describe("conversation state across server instances", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  function instance(store: ConversationStore, replies: AIResponse[], seen: AIRequest[]) {
    const provider: AIProvider = {
      name: "scripted",
      generateResponse: async (req) => {
        seen.push(req);
        const next = replies.shift();
        if (!next) throw new Error("no scripted reply left");
        return next;
      },
    };
    return createChatHandler({
      getProvider: () => provider,
      store,
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });
  }

  const post = (body: object) =>
    new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) });

  it("enforces an allergy declared on one instance when the next message hits another", async () => {
    const shared = new InMemoryConversationStore();
    const seenA: AIRequest[] = [];
    const seenB: AIRequest[] = [];
    const a = instance(
      shared,
      [{ message: "Noted.", intent: "meal_planning", profileUpdate: { householdSize: 3 } }],
      seenA,
    );
    const b = instance(
      shared,
      [
        {
          message: "Fry plantain in groundnut oil.",
          intent: "meal_planning",
          recommendedFoods: ["groundnut oil"],
        },
        {
          message: "Fry plantain in palm oil.",
          intent: "meal_planning",
          recommendedFoods: ["palm oil"],
        },
      ],
      seenB,
    );

    const first = await (await a(post({ message: "My son is allergic to peanuts." }))).json();
    const second = await (
      await b(post({ conversationId: first.conversationId, message: "Plantain ideas?" }))
    ).json();

    expect(seenB[0].systemPrompt).toContain("Declared allergy or food to avoid: peanut");
    expect(seenB[0].systemPrompt).toContain("Planning for 3 people.");
    expect(seenB[0].messages.map((m) => m.content)).toEqual([
      "My son is allergic to peanuts.",
      "Noted.",
      "Plantain ideas?",
    ]);
    expect(second.message).toBe("Fry plantain in palm oil.");
  });
});
