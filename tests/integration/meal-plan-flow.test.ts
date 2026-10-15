import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import type { MealPlan } from "@/lib/meals/plan";

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
  const POST = createChatHandler({
    getProvider: () => provider,
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

const ask = (message: string, profileUpdate?: AIResponse["profileUpdate"]): AIResponse => ({
  message,
  intent: "meal_planning",
  ...(profileUpdate ? { profileUpdate } : {}),
});

const onePlan = (foods: string[], name = "Rice and beans"): MealPlan => ({
  days: [{ day: "Day 1", meals: [{ mealType: "lunch", name, foods }] }],
});

const withPlan = (plan: MealPlan): AIResponse => ({
  message: "Here is a plan for today.",
  intent: "meal_planning",
  mealPlan: plan,
  recommendedFoods: plan.days.flatMap((d) => d.meals.flatMap((m) => m.foods)),
});

const userContext = (req: AIRequest) =>
  req.systemPrompt.split("CURRENT USER CONTEXT:\n")[1]?.split("\n\n")[0] ?? "";

describe("meal planning conversation", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("collects facts progressively, never re-asks them, then returns the plan", async () => {
    const plan = onePlan(["rice", "beans", "palm oil"]);
    const { provider, requests } = scripted([
      ask("Who are we planning for?"),
      ask("What are their ages?", { householdSize: 4 }),
      ask("Any allergies?", {
        members: [
          { label: "adult" },
          { label: "adult" },
          { label: "child", ageYears: 3 },
          { label: "child", ageYears: 7 },
        ],
      }),
      ask("What food do you have at home?"),
      withPlan(plan),
    ]);
    const send = chat(provider);

    await send("Create a meal plan for my family.");
    await send("Four.");
    await send("Two adults, a 3-year-old and a 7-year-old.");
    await send("My youngest is allergic to peanuts.");
    const final = await send("We have rice, beans and palm oil.");

    expect(userContext(requests[0])).toContain(
      "still unknown in priority order: who the meals are for",
    );
    expect(userContext(requests[2])).toContain("Planning for 4 people.");
    expect(userContext(requests[2])).toMatch(/still unknown.*: roughly how old each person is/);

    // The allergy is detected from the same message, so it is already known here.
    const ctx3 = userContext(requests[3]);
    expect(ctx3).toContain("child (3 years)");
    expect(ctx3).toContain("A child under 5 is involved");
    expect(ctx3).toContain("Allergies: peanut.");
    expect(ctx3).toMatch(/still unknown.*: what food they already have at home/);
    expect(ctx3).not.toMatch(/still unknown.*allergies/);

    // Facts persist across turns: the allergy and children are still known.
    const ctx4 = userContext(requests[4]);
    expect(ctx4).toContain("Allergies: peanut.");
    expect(ctx4).toContain("child (3 years)");

    expect(final.metadata.mealPlan).toEqual(plan);
    expect(final.metadata.allergyNotice).toBe(
      "Leaving out peanut because you said it must be avoided.",
    );
  });

  it("regenerates a plan that breaks an allergy, then returns the safe one", async () => {
    const { provider, requests } = scripted([
      ask("Noted."),
      withPlan(onePlan(["rice", "groundnut soup"], "Rice with groundnut soup")),
      withPlan(onePlan(["rice", "egusi soup"], "Rice with egusi soup")),
    ]);
    const send = chat(provider);
    await send("My son is allergic to peanuts.");
    const body = await send("Plan lunch for today.");

    expect(requests[2].systemPrompt).toContain("CORRECTION REQUIRED");
    expect(body.metadata.mealPlan.days[0].meals[0].name).toBe("Rice with egusi soup");
  });

  it("applies infant rules from facts given in the same message", async () => {
    const { provider, requests } = scripted([
      {
        ...withPlan(onePlan(["pap", "honey"], "Pap with honey")),
        profileUpdate: { members: [{ label: "baby", ageYears: 0.75 }] },
      },
      {
        ...withPlan(onePlan(["pap", "mashed banana"], "Pap with banana")),
        profileUpdate: { members: [{ label: "baby", ageYears: 0.75 }] },
      },
    ]);
    const body = await chat(provider)("Breakfast ideas for my 9-month-old?");

    expect(requests[1].systemPrompt).toMatch(/honey \(not safe for babies under 12 months\)/);
    expect(body.metadata.mealPlan.days[0].meals[0].name).toBe("Pap with banana");
  });

  it("regenerates a malformed plan, and falls back if it stays malformed", async () => {
    const malformed: AIResponse = {
      message: "Plan:",
      intent: "meal_planning",
      invalidMealPlan: true,
    };
    const { provider } = scripted([malformed, malformed]);
    const body = await chat(provider)("Plan my meals.");

    expect(body.metadata?.mealPlan).toBeUndefined();
    expect(body.message).toMatch(/couldn't put together suggestions/);
  });

  it("enforces an allergy the model reported, even without an allergy cue word", async () => {
    const { provider } = scripted([
      ask("Got it, no sesame.", { allergies: ["sesame"] }),
      withPlan(onePlan(["bread", "beniseed"], "Bread with beniseed")),
      withPlan(onePlan(["bread", "egg"], "Bread and egg")),
    ]);
    const send = chat(provider);
    await send("Sesame gives my daughter hives.");
    const body = await send("Plan breakfast.");

    expect(body.metadata.mealPlan.days[0].meals[0].name).toBe("Bread and egg");
  });

  it("marks allergies as answered when the user says there are none", async () => {
    const { provider, requests } = scripted([ask("Great."), ask("What food is at home?")]);
    const send = chat(provider);
    await send("No allergies.");
    await send("Plan dinner.");

    expect(userContext(requests[1])).toContain("No food allergies (the user confirmed).");
    expect(userContext(requests[1])).not.toMatch(/still unknown.*allergies/);
  });
});
