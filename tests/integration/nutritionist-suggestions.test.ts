import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import type { NutritionistCard, NutritionistFinder } from "@/lib/nutritionists/types";

const card = (id: string): NutritionistCard => ({
  id,
  name: `Nutritionist ${id}`,
  title: "Registered Dietitian",
  photoUrl: null,
  specializations: ["Pregnancy and breastfeeding"],
  qualificationSummary: [],
  state: "Lagos",
  city: "",
  yearsExperience: 5,
  sessionTypes: ["online"],
  sessionFeeMinor: 500000,
  sessionMinutes: 60,
  availability: ["Monday 09:00–17:00"],
});

function chat(replies: AIResponse[], finder?: NutritionistFinder) {
  const provider: AIProvider = {
    name: "scripted",
    generateResponse: async () => {
      const next = replies.shift();
      if (!next) throw new Error("no scripted reply left");
      return next;
    },
  };
  const POST = createChatHandler({
    getProvider: () => provider,
    getNutritionists: () => finder,
    store: new InMemoryConversationStore(),
    rateLimiter: new InMemoryRateLimiter(100, 60_000),
  });
  let conversationId: string | undefined;
  return async (message: string) => {
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId, message }),
      }),
    );
    const body = await res.json();
    conversationId = body.conversationId;
    return body;
  };
}

const say = (message: string): AIResponse => ({ message, intent: "general_nutrition" });

describe("nutritionist suggestions in chat (ADR-064)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("suggests matching nutritionists once, when a referral situation first appears", async () => {
    const finder = vi.fn<NutritionistFinder>(async () => [
      card("a"),
      card("b"),
      card("c"),
      card("d"),
    ]);
    const send = chat([say("Congratulations!"), say("Here are some ideas.")], finder);

    const first = await send("I'm pregnant and I live in Lagos. What should I eat?");
    expect(first.metadata.nutritionists).toHaveLength(3);
    expect(finder).toHaveBeenCalledWith({
      specializations: ["maternal"],
      state: "Lagos",
    });

    const second = await send("What about breakfast?");
    expect(second.metadata?.nutritionists).toBeUndefined();
    expect(finder).toHaveBeenCalledTimes(1);
  });

  it("suggests when the user asks for a dietitian, and never in an emergency", async () => {
    const finder = vi.fn<NutritionistFinder>(async () => [card("a")]);
    const ask = chat([say("Sure.")], finder);
    expect((await ask("Can you recommend a dietitian?")).metadata.nutritionists).toHaveLength(1);

    const emergency = chat([say("Please get care now.")], finder);
    const reply = await emergency("My child is having convulsions, should I see a dietitian?");
    expect(reply.metadata.urgentNotice).toBeTruthy();
    expect(reply.metadata.nutritionists).toBeUndefined();
  });

  it("keeps chat working when the directory fails or is off", async () => {
    const failing = vi.fn<NutritionistFinder>(async () => {
      throw new Error("db down");
    });
    const reply = await chat([say("Congratulations!")], failing)("I'm pregnant");
    expect(reply.message).toBe("Congratulations!");
    expect(reply.metadata?.nutritionists).toBeUndefined();

    const off = await chat([say("Congratulations!")])("I'm pregnant");
    expect(off.metadata?.nutritionists).toBeUndefined();
  });
});
