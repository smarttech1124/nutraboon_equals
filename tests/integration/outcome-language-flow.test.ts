import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import { NutritionService } from "@/lib/nutrition/service";
import { seedRepository } from "../helpers/seed-foods";
import { estimate, priceService } from "../helpers/seed-prices";

function scripted(replies: AIResponse[]) {
  const requests: AIRequest[] = [];
  const provider: AIProvider = {
    name: "scripted",
    generateResponse: async (req) => {
      requests.push(req);
      const next = replies.shift();
      if (!next) throw new Error("no scripted reply left");
      return next;
    },
  };
  return { provider, requests };
}

function chat(provider: AIProvider) {
  const nutrition = new NutritionService(seedRepository());
  const prices = priceService();
  const POST = createChatHandler({
    getProvider: () => provider,
    getNutrition: () => nutrition,
    getPrices: () => prices,
    store: new InMemoryConversationStore(),
    rateLimiter: new InMemoryRateLimiter(100, 60_000),
  });
  let conversationId: string | undefined;
  return async (message: string, language?: string) => {
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId, message, ...(language ? { language } : {}) }),
      }),
    );
    const body = await res.json();
    conversationId = body.conversationId;
    return body;
  };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("outcome card (ADR-051)", () => {
  it("turns a budget meal plan into a titled outcome with per-meal costs and nutrition focus", async () => {
    const { provider } = scripted([
      {
        message: "Here is a plan for today.",
        intent: "budget_planning",
        profileUpdate: { householdSize: 3, allergiesConfirmed: true },
        mealPlan: {
          days: [
            {
              day: "Day 1",
              meals: [
                { mealType: "breakfast", name: "Bread and egg", foods: ["bread", "egg"] },
                {
                  mealType: "dinner",
                  name: "Garri and beans",
                  foods: ["garri", "beans", "palm oil"],
                },
              ],
            },
          ],
        },
        shoppingList: [
          { item: "eggs", quantity: 0.2, forMeal: "Bread and egg" },
          { item: "garri", quantity: 0.5, forMeal: "Garri and beans" },
        ],
        fromHome: ["beans", "palm oil"],
      },
    ]);
    const send = chat(provider);
    const body = await send("I have ₦2,000 for 3 people, we have beans and palm oil");

    const outcome = body.metadata.outcome;
    expect(outcome).toMatchObject({
      kind: "meal_plan",
      title: "Your ₦2,000 meal plan",
      subtitle: "For 3 people • 1 day",
    });
    const eggs = body.metadata.budget.purchases.find((p: { name: string }) => /egg/i.test(p.name));
    expect(outcome.mealCosts["0:0"]).toBe(eggs.estimatedCost);
    expect(Math.round(eggs.estimatedCost / 10) * 10).toBe(
      Math.round((estimate("eggs-crate-30") * 0.2) / 10) * 10,
    );
    expect(outcome.nutritionFocus.length).toBeGreaterThan(0);
    // The foods behind the focus are credited as data sources.
    expect(body.metadata.foods.length).toBeGreaterThan(0);
  });

  it("never highlights a food the user is allergic to", async () => {
    const { provider } = scripted([
      {
        message: "Here is a plan.",
        intent: "meal_planning",
        mealPlan: {
          days: [
            { day: "Day 1", meals: [{ mealType: "lunch", name: "Rice", foods: ["rice", "egg"] }] },
          ],
        },
      },
    ]);
    const body = await chat(provider)("Plan lunch. I'm allergic to peanuts");
    const named =
      body.metadata.outcome.nutritionFocus?.flatMap((n: { foods: string[] }) => n.foods) ?? [];
    expect(named.some((n: string) => /groundnut|peanut/i.test(n))).toBe(false);
  });

  it("shows verified per-serving facts for a food question", async () => {
    const { provider } = scripted([
      { message: "Oranges are a good source of vitamin C.", intent: "food_information" },
    ]);
    const body = await chat(provider)("What is in an orange?");
    expect(body.metadata.outcome).toMatchObject({
      kind: "food_facts",
      title: "Orange at a glance",
    });
    expect(body.metadata.outcome.foodFacts[0].nutrients.length).toBeGreaterThan(0);
  });

  it("asks the model for a short lead-in and forMeal tags", async () => {
    const { provider, requests } = scripted([{ message: "Hi", intent: "unknown" }]);
    await chat(provider)("Hello");
    expect(requests[0].systemPrompt).toContain("Outcome rules:");
    expect(requests[0].systemPrompt).toContain("set forMeal on each shoppingList item");
  });
});

describe("response language (ADR-050)", () => {
  it("asks for Nigerian English by default and the chosen English variant otherwise", async () => {
    const { provider, requests } = scripted([
      { message: "Hi", intent: "unknown" },
      { message: "Hi", intent: "unknown" },
    ]);
    const send = chat(provider);
    await send("Hello");
    await send("Hello again", "en-GB");
    expect(requests[0].systemPrompt).toContain("in Nigerian English");
    expect(requests[1].systemPrompt).toContain("in British English");
  });

  it("ignores an unknown language instead of failing", async () => {
    const { provider, requests } = scripted([{ message: "Hi", intent: "unknown" }]);
    const body = await chat(provider)("Hello", "xx-XX");
    expect(body.message).toBe("Hi");
    expect(requests[0].systemPrompt).toContain("in Nigerian English");
  });

  it("requires an English version of a Yoruba reply and regenerates without one", async () => {
    const { provider, requests } = scripted([
      { message: "Ẹ ku àárọ̀! Kí ni ẹ fẹ́ jẹ?", intent: "general_nutrition" },
      {
        message: "Ẹ ku àárọ̀! Kí ni ẹ fẹ́ jẹ?",
        englishMessage: "Good morning! What would you like to eat?",
        intent: "general_nutrition",
      },
    ]);
    const body = await chat(provider)("Good morning", "yo-NG");
    expect(requests[0].systemPrompt).toContain("in Yoruba");
    expect(requests[0].systemPrompt).toContain("Write safetyNotice in English.");
    expect(requests).toHaveLength(2);
    expect(requests[1].systemPrompt).toContain("englishMessage is required");
    expect(body.message).toBe("Ẹ ku àárọ̀! Kí ni ẹ fẹ́ jẹ?");
  });

  it("checks allergies in both the Yoruba reply and its English version", async () => {
    const unsafe: AIResponse = {
      message: "Ẹ lè jẹ ìrẹsì pẹ̀lú epa.",
      englishMessage: "You can eat rice with groundnuts.",
      intent: "meal_planning",
      recommendedFoods: ["rice"],
    };
    const { provider } = scripted([unsafe, unsafe]);
    const body = await chat(provider)("Mo ní àléjì sí peanuts. I'm allergic to peanuts", "yo-NG");
    // Both attempts mention groundnut, so the safe fallback is shown.
    expect(body.message).not.toContain("epa");
    expect(body.intent).toBe("safety_sensitive");
  });
});
