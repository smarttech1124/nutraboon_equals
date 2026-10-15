import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import { NutritionService, type NutritionLookup } from "@/lib/nutrition/service";
import { seedFood, seedRepository } from "../helpers/seed-foods";

function post(message: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

describe("chat API with food lookup", () => {
  let seen: AIRequest[];
  let provider: AIProvider;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    seen = [];
    provider = {
      name: "spy",
      generateResponse: async (req) => {
        seen.push(req);
        return { message: "An orange is a good source of vitamin C.", intent: "food_information" };
      },
    };
  });

  function handler(nutrition?: NutritionLookup | (() => NutritionLookup)) {
    return createChatHandler({
      getProvider: () => provider,
      getNutrition: typeof nutrition === "function" ? nutrition : () => nutrition,
      store: new InMemoryConversationStore(),
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });
  }

  it("gives the model verified facts for the food asked about and returns its sources", async () => {
    const POST = handler(new NutritionService(seedRepository()));
    const res = await POST(post("What's the nutrition in an orange?"));
    const body = await res.json();

    const prompt = seen[0].systemPrompt;
    expect(prompt).toContain('VERIFIED DATA:\n- Orange (source entry: "Orange, raw"');
    expect(prompt).toContain(`Per 1 medium orange (about ${seedFood("orange").serving!.grams} g)`);

    expect(body.metadata.foods).toEqual([
      expect.objectContaining({
        id: "orange",
        source: expect.stringContaining("FAO/INFOODS"),
        servingSource: expect.stringContaining("USDA"),
      }),
    ]);
  });

  it("uses local names (garri) and several foods at once", async () => {
    const POST = handler(new NutritionService(seedRepository()));
    const body = await (await POST(post("Is garri or pawpaw better with groundnut?"))).json();
    expect(body.metadata.foods.map((f: { id: string }) => f.id)).toEqual([
      "gari",
      "pawpaw",
      "groundnut",
    ]);
  });

  it("sends no verified data and no foods metadata when no food is named", async () => {
    const POST = handler(new NutritionService(seedRepository()));
    const body = await (await POST(post("How do I eat healthily?"))).json();
    expect(seen[0].systemPrompt).toContain("VERIFIED DATA: none available");
    expect(body.metadata).toBeUndefined();
  });

  it("still answers, without figures, when the food database fails", async () => {
    const info = vi.spyOn(console, "info");
    const POST = handler({
      findFoodsInMessage: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await POST(post("What's in an orange?"));

    expect(res.status).toBe(200);
    expect(seen[0].systemPrompt).toContain("VERIFIED DATA: none available");
    expect(info.mock.calls.flat().join(" ")).toContain('"degraded":["nutrition_unavailable"]');
  });

  it("still answers when the database client cannot be created", async () => {
    const POST = handler(() => {
      throw new Error("DATABASE_URL is not set");
    });
    expect((await POST(post("What's in an orange?"))).status).toBe(200);
  });
});

describe("food data and declared allergies", () => {
  it("does not give the model nutrition facts for a food the user is allergic to", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const seen: AIRequest[] = [];
    const POST = createChatHandler({
      getProvider: () => ({
        name: "spy",
        generateResponse: async (req) => {
          seen.push(req);
          return { message: "Noted, no peanuts.", intent: "safety_sensitive" };
        },
      }),
      getNutrition: () => new NutritionService(seedRepository()),
      store: new InMemoryConversationStore(),
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });

    const body = await (
      await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "My son is allergic to peanuts. Is an orange okay?" }),
        }),
      )
    ).json();

    expect(seen[0].systemPrompt).not.toContain("Groundnut (peanut)");
    expect(seen[0].systemPrompt).toContain("Orange (source entry");
    expect(body.metadata.foods.map((f: { id: string }) => f.id)).toEqual(["orange"]);
  });
});
