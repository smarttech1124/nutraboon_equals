import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import type { ProductCard, ProductFinder } from "@/lib/vendors/types";

const card: ProductCard = {
  id: "p1",
  name: "Plain yogurt",
  vendorName: "Farm Fresh",
  category: "dairy",
  imageUrl: null,
  description: "Plain yogurt.",
  availability: "in_stock",
  priceNaira: 1800,
  whereToBuy: ["Shoprite Ikeja (Ikeja, Lagos)"],
  matchedTerm: "yogurt",
};

function chat(replies: AIResponse[], finder?: ProductFinder) {
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
    getProducts: () => finder,
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

describe("sponsored products in chat (ADR-067)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("does not offer products while the person is just asking about food (ADR-078)", async () => {
    const finder = vi.fn<ProductFinder>(async () => [card]);
    const send = chat(
      [
        { message: "Hello!", intent: "general_nutrition" },
        {
          message: "Try yogurt with pawpaw.",
          intent: "food_information",
          recommendedFoods: ["yogurt", "pawpaw"],
        },
      ],
      finder,
    );
    expect((await send("Hi, my son is allergic to peanuts")).metadata?.products).toBeUndefined();
    expect((await send("What is a good breakfast?")).metadata?.products).toBeUndefined();
    expect(finder).not.toHaveBeenCalled();
  });

  it("offers products when asked to buy, with the reply's foods and the user's allergies", async () => {
    const finder = vi.fn<ProductFinder>(async () => [card]);
    const send = chat(
      [
        {
          message: "Plain yogurt is a good choice.",
          intent: "food_information",
          recommendedFoods: ["yogurt", "pawpaw"],
        },
      ],
      finder,
    );
    const reply = await send("My son is allergic to peanuts. Where can I buy good yogurt?");
    expect(reply.metadata.products).toEqual([card]);
    expect(finder).toHaveBeenCalledWith(
      expect.objectContaining({ terms: ["yogurt", "pawpaw"], allergies: ["peanut"], limit: 2 }),
    );
  });

  it("offers products for foods discussed earlier when the person wraps up", async () => {
    const finder = vi.fn<ProductFinder>(async () => [card]);
    const send = chat(
      [
        {
          message: "Yogurt with pawpaw makes a good breakfast.",
          intent: "food_information",
          recommendedFoods: ["yogurt"],
        },
        { message: "Add some groundnuts if you like.", intent: "food_information" },
        { message: "You're welcome! Enjoy your breakfast.", intent: "general_nutrition" },
      ],
      finder,
    );
    expect((await send("Breakfast ideas?")).metadata?.products).toBeUndefined();
    expect((await send("Anything to add?")).metadata?.products).toBeUndefined();
    const last = await send("Thanks, that's all");
    expect(last.metadata.products).toEqual([card]);
    expect(finder).toHaveBeenCalledTimes(1);
    expect(finder.mock.calls[0]![0].recentText).toContain("Yogurt with pawpaw");
  });

  it("never shows products in an emergency, and survives a failing directory", async () => {
    const finder = vi.fn<ProductFinder>(async () => [card]);
    const urgent = await chat(
      [{ message: "Get care now.", intent: "safety_sensitive", recommendedFoods: ["yogurt"] }],
      finder,
    )("My child is having convulsions, what should I buy?");
    expect(urgent.metadata.urgentNotice).toBeTruthy();
    expect(urgent.metadata.products).toBeUndefined();

    const failing = vi.fn<ProductFinder>(async () => {
      throw new Error("db down");
    });
    const reply = await chat(
      [{ message: "Try yogurt.", intent: "food_information", recommendedFoods: ["yogurt"] }],
      failing,
    )("Which yogurt brand should I buy?");
    expect(reply.message).toBe("Try yogurt.");
    expect(reply.metadata?.products).toBeUndefined();
  });
});
