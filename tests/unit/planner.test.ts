import { describe, expect, it, vi } from "vitest";
import type { AIProvider, JsonRequest } from "@/lib/ai/types";
import { buildPriceBook } from "@/lib/budget/prices";
import type { FoodRecord, NutrientValues } from "@/lib/nutrition/types";
import {
  allowedDurations,
  mergeFacts,
  missingTopics,
  parseFacts,
  planBlockers,
  type PlannerFacts,
} from "@/lib/planner/facts";
import { generateDays, PlannerGenerationError, replaceMeal } from "@/lib/planner/generate";
import { intakeTurn } from "@/lib/planner/intake";
import { dayNutrition, showNutrition } from "@/lib/planner/nutrition";
import type { PlannerDay, PlannerMeal } from "@/lib/planner/schema";
import { buildShoppingList } from "@/lib/planner/shopping";

const OPTS = { customObjectives: false };

const meal = (overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
  mealType: "breakfast",
  name: "Yam and egg sauce",
  portion: "Adults: 2 slices; child: 1 slice",
  ingredients: [
    { name: "yam", amount: "4 slices", grams: 600 },
    { name: "egg", amount: "4", pieces: 4 },
  ],
  steps: ["Boil the yam.", "Scramble the eggs with tomato and onion until fully cooked."],
  substitutions: [{ ingredient: "yam", alternative: "sweet potato" }],
  why: "Yam gives energy and the egg adds protein.",
  ...overrides,
});

const day = (meals: PlannerMeal[] = [meal()]): PlannerDay => ({
  meals,
  goalNote: "A filling start to the day.",
});

/** A provider answering structured requests from a queue. */
function fakeProvider(answers: unknown[]) {
  const requests: JsonRequest[] = [];
  const provider: AIProvider = {
    name: "fake",
    generateResponse: vi.fn(),
    generateJson: vi.fn(async (req: JsonRequest) => {
      requests.push(req);
      if (answers.length === 0) throw new Error("no answer left");
      return answers.shift();
    }),
  };
  return { provider, requests };
}

describe("planner facts (ADR-066)", () => {
  it("asks only what the plan needs, in order, then one open question", () => {
    expect(missingTopics({})).toEqual(["objective", "members", "allergies"]);
    const facts: PlannerFacts = {
      objective: "budget",
      members: [{ label: "me", ageYears: 30 }],
      allergiesConfirmed: true,
    };
    expect(missingTopics(facts)).toEqual(["budget"]);
    expect(missingTopics({ ...facts, budgetNaira: 20000 })).toEqual(["extras"]);
    expect(missingTopics({ ...facts, budgetNaira: 20000, extrasAsked: true })).toEqual([]);
    expect(missingTopics({ ...facts, objective: "weight" })).toEqual(["weightGoal"]);
  });

  it("reads health facts from the user's words, not just the AI", () => {
    const facts = mergeFacts(
      {},
      { objective: "family", members: [{ label: "son", ageYears: 3 }] },
      "My son is allergic to peanuts and I'm pregnant. We live in Ibadan.",
      OPTS,
    );
    expect(facts).toMatchObject({
      objective: "family",
      allergies: ["peanut"],
      allergiesConfirmed: true,
      pregnant: true,
      state: "Oyo",
    });
    // The AI cannot remove an allergy, and "no allergies" confirms without adding any.
    expect(mergeFacts(facts, { noAllergies: true }, "", OPTS).allergies).toEqual(["peanut"]);
    expect(mergeFacts({}, {}, "No allergies.", OPTS).allergiesConfirmed).toBe(true);
  });

  it("keeps custom goals for accounts entitled to them", () => {
    expect(mergeFacts({}, { objective: "custom" }, "", OPTS).objective).toBeUndefined();
    expect(mergeFacts({}, { objective: "custom" }, "", { customObjectives: true }).objective).toBe(
      "custom",
    );
  });

  it("refuses plans code says it must not make", () => {
    expect(planBlockers({ members: [{ label: "baby", ageYears: 0.3 }] })).toHaveLength(1);
    expect(
      planBlockers({ weightGoal: "lose", members: [{ label: "daughter", ageYears: 12 }] }),
    ).toHaveLength(1);
    expect(planBlockers({ weightGoal: "lose", pregnant: true })).toHaveLength(1);
    expect(planBlockers({ conditions: ["eating_disorder"] })).toHaveLength(1);
    expect(planBlockers({ weightGoal: "lose", members: [{ label: "me", ageYears: 40 }] })).toEqual(
      [],
    );
  });

  it("drops invalid stored facts field by field and limits durations by entitlement", () => {
    expect(parseFacts({ objective: "nonsense", budgetNaira: 5000, members: "x" })).toEqual({
      budgetNaira: 5000,
    });
    expect(allowedDurations(2).map((d) => d.days)).toEqual([1, 2]);
    expect(allowedDurations(366).map((d) => d.days)).toEqual([1, 2, 7, 30, 183, 366]);
  });
});

describe("intake turn", () => {
  it("makes one AI call, asking from the app's ordered list", async () => {
    const { provider, requests } = fakeProvider([
      {
        message: "Does anyone have a food allergy?",
        update: { objective: "family", members: [{ label: "me", ageYears: 35 }] },
      },
    ]);
    const result = await intakeTurn(
      { facts: {}, messages: [], userMessage: "Family meals for me, I'm 35" },
      provider,
      OPTS,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].systemPrompt).toContain(
      "STILL NEEDED, in this order:\n1. Ask what they want",
    );
    expect(result.status).toBe("intake");
    expect(result.facts).toMatchObject({ objective: "family" });
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Does anyone have a food allergy?",
    });
  });

  it("answers with the app's own text when planning is not possible", async () => {
    const { provider } = fakeProvider([
      {
        message: "Great, what foods do they like?",
        update: { members: [{ label: "baby", ageYears: 0.25 }] },
      },
    ]);
    const result = await intakeTurn(
      { facts: { objective: "child_nutrition" }, messages: [], userMessage: "my 3 month old" },
      provider,
      OPTS,
    );
    expect(result.status).toBe("blocked");
    expect(result.messages.at(-1)?.content).toContain("breast milk or infant formula");
  });

  it("asks the open question once, then is ready", async () => {
    const base: PlannerFacts = {
      objective: "healthy",
      members: [{ label: "me", ageYears: 30 }],
    };
    const first = fakeProvider([{ message: "Anything else to plan around?" }]);
    const asked = await intakeTurn(
      { facts: base, messages: [], userMessage: "No allergies" },
      first.provider,
      OPTS,
    );
    expect(asked).toMatchObject({
      status: "intake",
      facts: { extrasAsked: true, allergiesConfirmed: true },
    });
    const second = fakeProvider([{ message: "Great, ready." }]);
    const ready = await intakeTurn(
      { facts: asked.facts, messages: asked.messages, userMessage: "That's all" },
      second.provider,
      OPTS,
    );
    expect(ready.status).toBe("ready");
  });

  it("fails on invalid AI output instead of guessing", async () => {
    const { provider } = fakeProvider([{ nonsense: true }]);
    await expect(
      intakeTurn({ facts: {}, messages: [], userMessage: "hi" }, provider, OPTS),
    ).rejects.toThrow();
  });
});

describe("plan generation", () => {
  const facts: PlannerFacts = {
    objective: "family",
    members: [
      { label: "adult", ageYears: 35 },
      { label: "child", ageYears: 3 },
    ],
    allergies: ["peanut"],
    allergiesConfirmed: true,
    mealSlots: ["breakfast"],
  };

  it("requires every main meal each day unless the user chose fewer", async () => {
    const onlyBreakfast = { days: [day([meal()])] };
    const { provider, requests } = fakeProvider([onlyBreakfast, onlyBreakfast]);
    await expect(generateDays(provider, { ...facts, mealSlots: undefined }, 1, 1)).rejects.toEqual(
      new PlannerGenerationError("invalid"),
    );
    expect(requests[1].prompt).toContain("Every day must include breakfast, lunch, dinner");
    const full = day([meal(), meal({ mealType: "lunch" }), meal({ mealType: "dinner" })]);
    const ok = fakeProvider([{ days: [full] }]);
    expect(await generateDays(ok.provider, { ...facts, mealSlots: undefined }, 1, 1)).toEqual([
      full,
    ]);
  });

  it("writes a week in parallel chunks of two days, each with its own staples", async () => {
    const answers = [
      { days: [day([meal({ name: "A" })]), day([meal({ name: "B" })])] },
      { days: [day([meal({ name: "C" })]), day([meal({ name: "D" })])] },
      { days: [day([meal({ name: "E" })])] },
    ];
    const { provider, requests } = fakeProvider(answers);
    const days = await generateDays(provider, facts, 1, 5, ["Earlier week dish"]);
    expect(days.map((d) => d.meals[0].name)).toEqual(["A", "B", "C", "D", "E"]);
    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.prompt.split("\n")[0])).toEqual([
      "Write days 1 to 2 of the plan (2 days).",
      "Write days 3 to 4 of the plan (2 days).",
      "Write days 5 to 5 of the plan (1 day).",
    ]);
    expect(requests[0].prompt).toContain("yam, rice, beans, plantain");
    expect(requests[2].prompt).toContain("on: potato, bread or wheat");
    expect(requests.every((r) => r.prompt.includes("Earlier week dish"))).toBe(true);
    expect(requests.every((r) => r.timeoutMs === 60_000)).toBe(true);
    expect(requests[0].systemPrompt).toContain("peanut");
  });

  it("regenerates a chunk once after a safety violation, then refuses", async () => {
    const unsafe = day([
      meal({ ingredients: [{ name: "groundnut paste", amount: "2 spoons", grams: 30 }] }),
    ]);
    const fixed = day([meal()]);
    const once = fakeProvider([{ days: [unsafe] }, { days: [fixed] }]);
    const days = await generateDays(once.provider, facts, 1, 1);
    expect(days).toEqual([fixed]);
    expect(once.requests[1].prompt).toContain("groundnut");

    const twice = fakeProvider([{ days: [unsafe] }, { days: [unsafe] }]);
    await expect(generateDays(twice.provider, facts, 1, 1)).rejects.toEqual(
      new PlannerGenerationError("unsafe"),
    );
  });

  it("applies child-safety and dose rules to every text", async () => {
    const choking = day([meal({ ingredients: [{ name: "whole groundnuts", amount: "1 cup" }] })]);
    const dose = day([meal({ steps: ["Take 400 mcg of folic acid daily with this meal."] })]);
    const kid = fakeProvider([{ days: [choking] }, { days: [choking] }]);
    await expect(
      generateDays(kid.provider, { ...facts, allergies: [], mealSlots: ["breakfast"] }, 1, 1),
    ).rejects.toBeInstanceOf(PlannerGenerationError);
    const pregnant = fakeProvider([{ days: [dose] }, { days: [dose] }]);
    await expect(
      generateDays(
        pregnant.provider,
        { members: [{ label: "me", ageYears: 30 }], pregnant: true, mealSlots: ["breakfast"] },
        1,
        1,
      ),
    ).rejects.toEqual(new PlannerGenerationError("unsafe"));
  });

  it("reports invalid output and missing structured output", async () => {
    const bad = fakeProvider([{ days: [] }, { nonsense: true }]);
    await expect(generateDays(bad.provider, facts, 1, 1)).rejects.toEqual(
      new PlannerGenerationError("invalid"),
    );
    const chatOnly = { name: "chat", generateResponse: vi.fn() } as AIProvider;
    await expect(generateDays(chatOnly, facts, 1, 1)).rejects.toEqual(
      new PlannerGenerationError("unavailable"),
    );
  });

  it("replaces one meal and keeps the others", async () => {
    const original = day([
      meal({ name: "Breakfast A" }),
      meal({ mealType: "lunch", name: "Lunch A" }),
    ]);
    const { provider, requests } = fakeProvider([
      {
        days: [day([meal({ name: "Akara and pap" }), meal({ mealType: "lunch", name: "Other" })])],
      },
    ]);
    const next = await replaceMeal(provider, facts, original, 0, "no yam");
    expect(next.meals.map((m) => m.name)).toEqual(["Akara and pap", "Lunch A"]);
    expect(requests[0].prompt).toContain("no yam");
  });
});

describe("planner nutrition and shopping", () => {
  const values = (energyKcal: number, proteinG: number): NutrientValues =>
    ({ energyKcal, proteinG, fiberG: 1 }) as unknown as NutrientValues;
  const food = (id: string, per100g: NutrientValues) => ({ id, per100g }) as FoodRecord;

  it("calculates from matched ingredients with grams and says how many counted", () => {
    const foods = new Map([["yam", food("yam", values(100, 2))]]);
    expect(dayNutrition(day(), foods, 2)).toEqual({
      energyKcal: 600,
      proteinG: 12,
      fiberG: 6,
      counted: 1,
      total: 2,
    });
    expect(dayNutrition(day(), new Map(), 2).counted).toBe(0);
  });

  it("ignores implausible weights and counts pieces by serving weight", () => {
    const foods = new Map([
      ["yam", food("yam", values(100, 2))],
      [
        "egg",
        {
          ...food("egg", values(150, 12)),
          serving: { label: "1 egg", grams: 50, source: "x", sourceUrl: "x" },
        },
      ],
    ]);
    const whole = day([
      meal({
        ingredients: [
          { name: "yam", amount: "1 tuber", grams: 2000 },
          { name: "egg", amount: "4", pieces: 4 },
        ],
      }),
    ]);
    const n = dayNutrition(whole, foods, 2);
    // 2000 g of yam for 2 people is not counted; 4 eggs x 50 g are.
    expect(n).toMatchObject({ counted: 1, total: 2, energyKcal: 300, proteinG: 24 });
    expect(showNutrition(n)).toBe(false);
    expect(showNutrition(dayNutrition(day(), foods, 2))).toBe(true);
  });

  it("aggregates the week and costs only convertible units", () => {
    const book = buildPriceBook(
      "national",
      [
        {
          id: "yam",
          name: "Yam tuber",
          unitLabel: "1 kg",
          unitQuantity: 1000,
          unitMeasure: "g",
          price: 1200,
          region: "national",
          source: "NBS",
          sourceUrl: "https://example.test",
          effectiveMonth: "2026-05",
        },
        {
          id: "egg",
          name: "Eggs",
          unitLabel: "1 piece",
          unitQuantity: 1,
          unitMeasure: "piece",
          price: 150,
          region: "national",
          source: "NBS",
          sourceUrl: "https://example.test",
          effectiveMonth: "2026-05",
        },
      ],
      [
        { alias: "yam", foodId: "yam" },
        { alias: "egg", foodId: "egg" },
      ],
    );
    const list = buildShoppingList([day(), day()], book);
    const yam = list.lines.find((l) => l.name === "yam")!;
    expect(yam).toMatchObject({ grams: 1200, cost: 1440, amounts: ["4 slices", "4 slices"] });
    expect(list.lines.find((l) => l.name === "egg")).toMatchObject({ pieces: 8, cost: 1200 });
    expect(list.total).toBe(2640);
    expect(list.source?.month).toBe("2026-05");
    expect(buildShoppingList([day()], null)).toMatchObject({ total: 0, pricedCount: 0 });
  });

  it("never prices processed forms as the raw food, and converts oil to millilitres", () => {
    const base = {
      region: "national" as const,
      source: "NBS",
      sourceUrl: "https://example.test",
      effectiveMonth: "2026-05",
    };
    const book = buildPriceBook(
      "national",
      [
        {
          ...base,
          id: "tom",
          name: "Tomatoes",
          unitLabel: "1 kg",
          unitQuantity: 1000,
          unitMeasure: "g",
          price: 1000,
        },
        {
          ...base,
          id: "oil",
          name: "Vegetable oil",
          unitLabel: "75 cl bottle",
          unitQuantity: 750,
          unitMeasure: "ml",
          price: 2300,
        },
      ],
      [
        { alias: "tomato", foodId: "tom" },
        { alias: "tomatoes", foodId: "tom" },
        { alias: "vegetable oil", foodId: "oil" },
      ],
    );
    const list = buildShoppingList(
      [
        day([
          meal({
            ingredients: [
              { name: "tomato paste", amount: "2 spoons", grams: 60 },
              { name: "tomatoes", amount: "3", grams: 300 },
              { name: "vegetable oil", amount: "3 spoons", grams: 69 },
            ],
          }),
        ]),
      ],
      book,
    );
    expect(list.lines.find((l) => l.name === "tomato paste")?.cost).toBeUndefined();
    expect(list.lines.find((l) => l.name === "tomatoes")?.cost).toBe(300);
    // 69 g of oil is 75 ml: a tenth of a 750 ml bottle.
    expect(list.lines.find((l) => l.name === "vegetable oil")?.cost).toBeCloseTo(230);
  });
});
