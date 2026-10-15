import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderError, type AIProvider, type AIRequest, type AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import { NutritionService } from "@/lib/nutrition/service";
import { seedRepository } from "../helpers/seed-foods";

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
  const POST = createChatHandler({
    getProvider: () => provider,
    getNutrition: () => nutrition,
    store: new InMemoryConversationStore(),
    rateLimiter: new InMemoryRateLimiter(100, 60_000),
  });
  let conversationId: string | undefined;
  return async (message: string, extra: Record<string, unknown> = {}) => {
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId, message, ...extra }),
      }),
    );
    const body = await res.json();
    conversationId = body.conversationId;
    return body;
  };
}

const context = (req: AIRequest) =>
  req.systemPrompt.split("CURRENT USER CONTEXT:\n")[1]?.split("\n\n")[0] ?? "";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("conversation behaviour (ADR-055)", () => {
  it("writes for the ear when the question was spoken", async () => {
    const { provider, requests } = scripted([
      { message: "Hi", intent: "unknown" },
      { message: "Hi", intent: "unknown" },
    ]);
    const send = chat(provider);
    await send("Hello", { inputMode: "voice" });
    await send("Hello again");
    expect(requests[0].systemPrompt).toContain("Voice: the user spoke this question");
    expect(requests[1].systemPrompt).not.toContain("Voice: the user spoke this question");
  });

  it("tells the model the conversation rules from the review", async () => {
    const { provider, requests } = scripted([{ message: "Hi", intent: "unknown" }]);
    await chat(provider)("Hello");
    const prompt = requests[0].systemPrompt;
    expect(prompt).toContain("Never write performative empathy");
    expect(prompt).toContain("give something useful first, then ask the next question");
    expect(prompt).toContain("Ask at most ONE follow-up question");
    expect(prompt).toContain("Give each meal a why");
    expect(prompt).toContain("Medication literacy is allowed");
  });

  it("remembers that the family cannot afford a food, and regenerates a plan that uses it", async () => {
    const plan = (food: string): AIResponse => ({
      message: "Here is a plan.",
      intent: "meal_planning",
      mealPlan: {
        days: [
          {
            day: "Day 1",
            meals: [{ mealType: "dinner", name: `Rice and ${food}`, foods: ["rice", food] }],
          },
        ],
      },
    });
    const { provider, requests } = scripted([
      {
        message: "Okay, let's use a cheaper protein.",
        intent: "meal_planning",
        profileUpdate: { unaffordableFoods: ["chicken"] },
      },
      plan("chicken"),
      plan("beans"),
    ]);
    const send = chat(provider);
    await send("I can't afford chicken this week");
    const body = await send("Plan dinner");
    expect(context(requests[1])).toContain("Cannot afford right now: chicken.");
    expect(requests[2].systemPrompt).toMatch(/CORRECTION REQUIRED: .*cannot afford chicken/);
    expect(body.metadata.mealPlan.days[0].meals[0].name).toBe("Rice and beans");
  });

  it("shows a meal's why, and regenerates one with an invented nutrition figure", async () => {
    const meal = (why: string): AIResponse => ({
      message: "Here is a plan.",
      intent: "meal_planning",
      mealPlan: {
        days: [
          {
            day: "Day 1",
            meals: [{ mealType: "lunch", name: "Rice and egg", foods: ["rice", "egg"], why }],
          },
        ],
      },
    });
    const { provider, requests } = scripted([
      meal("The egg adds 13 g of protein."),
      meal("Rice gives energy and the egg adds protein, choline and vitamin B12."),
    ]);
    const body = await chat(provider)("Plan lunch for me");
    expect(requests).toHaveLength(2);
    expect(requests[1].systemPrompt).toMatch(/CORRECTION REQUIRED: .*13 g/);
    expect(body.metadata.mealPlan.days[0].meals[0].why).toBe(
      "Rice gives energy and the egg adds protein, choline and vitamin B12.",
    );
  });

  it("explains a dose the user was given, without blocking it", async () => {
    const { provider, requests } = scripted([
      {
        message:
          "Your 5 mg folic acid tablet is taken once a day. If you are unsure, ask the pharmacist.",
        intent: "safety_sensitive",
      },
    ]);
    const body = await chat(provider)(
      "I'm pregnant. The clinic gave me folic acid 5 mg, one daily. What does that mean?",
    );
    expect(requests).toHaveLength(1);
    expect(body.message).toContain("5 mg folic acid");
  });
});

describe("a reply in the wrong shape", () => {
  it("is asked for once more before the user sees an error", async () => {
    let calls = 0;
    const provider: AIProvider = {
      name: "flaky",
      generateResponse: async () => {
        calls++;
        if (calls === 1) throw new AIProviderError("bad output", "invalid_output");
        return { message: "Hello again", intent: "unknown" };
      },
    };
    const body = await chat(provider)("Hello");
    expect(body.message).toBe("Hello again");
    expect(calls).toBe(2);
  });

  it("still fails safely when the retry is wrong too", async () => {
    const provider: AIProvider = {
      name: "broken",
      generateResponse: async () => {
        throw new AIProviderError("bad output", "invalid_output");
      },
    };
    const body = await chat(provider)("Hello");
    expect(body.error.code).toBe("ai_unavailable");
  });
});

it("regenerates a reply that ignores the leftovers the parent named", async () => {
  const breakfast = (foods: string[]): AIResponse => ({
    message: "Here is breakfast.",
    intent: "meal_planning",
    mealPlan: {
      days: [{ day: "Day 1", meals: [{ mealType: "breakfast", name: "Breakfast", foods }] }],
    },
  });
  const { provider, requests } = scripted([
    breakfast(["bread", "egg"]),
    breakfast(["leftover beans", "bread"]),
  ]);
  const body = await chat(provider)("Now I only have leftover beans, bread and eggs. Breakfast?");
  expect(requests[1].systemPrompt).toMatch(/CORRECTION REQUIRED: .*leftover beans/);
  expect(body.metadata.mealPlan.days[0].meals[0].foods).toContain("leftover beans");
});

it("remembers a school plan across turns and keeps packed food in the plan", async () => {
  const { provider, requests } = scripted([
    { message: "How old are the children?", intent: "meal_planning" },
    {
      message: "Here is Monday.",
      intent: "meal_planning",
      mealPlan: {
        days: [
          {
            day: "Monday",
            meals: [
              { mealType: "breakfast", name: "Pap and akara", foods: ["pap", "beans"] },
              {
                mealType: "lunch",
                name: "Jollof rice and egg",
                foods: ["rice", "egg"],
                packed: true,
              },
            ],
          },
        ],
      },
    },
  ]);
  const send = chat(provider);
  await send("Plan my children's school lunchboxes for the week.");
  const body = await send("They are 6 and 9.");
  expect(context(requests[1])).toContain("Planning for school days.");
  expect(context(requests[1])).toContain("School meal planning.");
  expect(body.metadata.mealPlan.days[0].meals[1].packed).toBe(true);
});
