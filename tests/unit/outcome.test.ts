import { describe, expect, it } from "vitest";
import type { BudgetSummary } from "@/lib/budget/summary";
import type { MealPlan } from "@/lib/meals/plan";
import { roundNutrient, scaleNutrients } from "@/lib/nutrition/calculate";
import { computeThresholds } from "@/lib/nutrition/service";
import { buildOutcome, costMeals, foodFacts, nutritionFocus, richIn } from "@/lib/outcome/build";
import { seedFood, seedRecords } from "../helpers/seed-foods";

const thresholds = computeThresholds(seedRecords);

const plan: MealPlan = {
  days: [
    {
      day: "Day 1",
      meals: [
        { mealType: "breakfast", name: "Pap and egg", foods: ["ogi", "egg"] },
        { mealType: "lunch", name: "Garri and beans", foods: ["garri", "beans", "palm oil"] },
        { mealType: "dinner", name: "Yam and tomato sauce", foods: ["yam", "tomato", "onion"] },
      ],
    },
  ],
};

const budget = (purchases: BudgetSummary["purchases"], amount = 2000): BudgetSummary => {
  const total = purchases.reduce((s, p) => s + p.estimatedCost, 0);
  return {
    budget: amount,
    region: "national",
    regionLabel: "National average",
    priceSource: "NBS Selected Food Price Watch, May 2026",
    priceSourceUrl: "https://example.org/nbs",
    fromHome: ["beans"],
    purchases,
    unpriced: [],
    estimatedTotal: total,
    estimatedRemaining: amount - total,
  };
};

describe("computeThresholds", () => {
  it("takes the 75th percentile per nutrient from the dataset", () => {
    const protein = seedRecords
      .map((f) => f.per100g.proteinG)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    expect(thresholds.proteinG).toBe(protein[Math.ceil(0.75 * protein.length) - 1]);
  });
});

describe("nutrition focus", () => {
  it("names foods in the top quarter of our data, richest first, and only real ones", () => {
    const foods = ["egg", "beans-dry", "orange", "palm-oil-red"].map(seedFood);
    const focus = nutritionFocus(foods, thresholds)!;
    expect(focus.length).toBeGreaterThan(0);
    expect(focus.length).toBeLessThanOrEqual(4);
    for (const { nutrient, foods: names } of focus) {
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const food = foods.find((f) => f.name === name)!;
        expect(richIn(food, thresholds)).toContain(nutrient);
      }
    }
    expect(nutritionFocus([], thresholds)).toBeUndefined();
  });
});

describe("food facts", () => {
  it("gives per-serving values calculated from verified data", () => {
    const orange = seedFood("orange");
    const facts = foodFacts(orange, thresholds);
    const grams = orange.serving?.grams ?? 100;
    const energy = facts.nutrients.find((n) => n.label === "Energy")!;
    expect(energy).toEqual({
      label: "Energy",
      unit: "kcal",
      value: roundNutrient("energyKcal", scaleNutrients(orange.per100g, grams).energyKcal!),
    });
    expect(facts.amount).toContain(String(Math.round(grams)));
    expect(facts.richIn).toEqual(richIn(orange, thresholds));
  });
});

describe("costMeals", () => {
  it("adds up the purchases tied to each meal, matching dish names loosely", () => {
    const costs = costMeals(plan, [
      {
        name: "Eggs",
        quantity: "0.2",
        unitLabel: "crate of 30",
        estimatedCost: 900,
        forMeal: "pap and EGG",
      },
      {
        name: "White garri",
        quantity: "0.5",
        unitLabel: "1 kg",
        estimatedCost: 400,
        forMeal: "Garri and beans",
      },
      {
        name: "Tomatoes",
        quantity: "0.25",
        unitLabel: "1 kg",
        estimatedCost: 300,
        forMeal: "Yam and tomato sauce",
      },
      {
        name: "Onions",
        quantity: "0.25",
        unitLabel: "1 kg",
        estimatedCost: 200,
        forMeal: "Yam and tomato sauce",
      },
      { name: "Salt", quantity: "1", unitLabel: "pack", estimatedCost: 100 },
    ]);
    expect(costs).toEqual({ "0:0": 900, "0:1": 400, "0:2": 500 });
    expect(costMeals(plan, [])).toBeUndefined();
  });
});

describe("buildOutcome", () => {
  it("titles a budget meal plan with the budget, people and days", () => {
    const outcome = buildOutcome({
      mealPlan: plan,
      budget: budget([
        {
          name: "Eggs",
          quantity: "0.2",
          unitLabel: "crate",
          estimatedCost: 900,
          forMeal: "Pap and egg",
        },
      ]),
      askedFoods: [],
      suggestedFoods: [seedFood("egg"), seedFood("beans-dry")],
      thresholds,
      people: 3,
    })!;
    expect(outcome).toMatchObject({
      kind: "meal_plan",
      title: "Your ₦2,000 meal plan",
      subtitle: "For 3 people • 1 day",
      mealCosts: { "0:0": 900 },
    });
    expect(outcome.nutritionFocus?.length).toBeGreaterThan(0);
  });

  it("titles plans and lists without a budget, and a multi-day plan", () => {
    const twoDays: MealPlan = { days: [plan.days[0], { ...plan.days[0], day: "Day 2" }] };
    expect(
      buildOutcome({ mealPlan: twoDays, askedFoods: [], suggestedFoods: [], people: 1 }),
    ).toMatchObject({ title: "Your 2-day meal plan", subtitle: "For 1 person • 2 days" });
    const list = { ...budget([]), budget: undefined, estimatedRemaining: undefined };
    expect(buildOutcome({ budget: list, askedFoods: [], suggestedFoods: [] })).toMatchObject({
      kind: "shopping_list",
      title: "Your shopping list",
    });
    expect(buildOutcome({ budget: budget([]), askedFoods: [], suggestedFoods: [] })).toMatchObject({
      kind: "budget_plan",
      title: "Your ₦2,000 food plan",
    });
  });

  it("builds a facts card for one food or a comparison", () => {
    expect(
      buildOutcome({ askedFoods: [seedFood("orange")], suggestedFoods: [], thresholds }),
    ).toMatchObject({ kind: "food_facts", title: "Orange at a glance" });
    const compare = buildOutcome({
      askedFoods: [seedFood("orange"), seedFood("banana")],
      suggestedFoods: [],
      thresholds,
    })!;
    expect(compare.title).toBe(`${seedFood("orange").name} vs ${seedFood("banana").name}`);
    expect(compare.foodFacts).toHaveLength(2);
  });

  it("returns nothing for plain conversation", () => {
    expect(buildOutcome({ askedFoods: [], suggestedFoods: [], thresholds })).toBeUndefined();
  });
});

it("uses the known budget in the title even when nothing needs buying", () => {
  expect(
    buildOutcome({ mealPlan: plan, askedFoods: [], suggestedFoods: [], budgetNaira: 1500 }),
  ).toMatchObject({ title: "Your ₦1,500 meal plan" });
});

it("matches a dish name given in another word order", () => {
  expect(
    costMeals(
      {
        days: [
          {
            day: "Day 1",
            meals: [{ mealType: "lunch", name: "Soaked garri and beans", foods: ["garri"] }],
          },
        ],
      },
      [
        {
          name: "White garri",
          quantity: "0.5",
          unitLabel: "1 kg",
          estimatedCost: 410,
          forMeal: "Garri and soaked beans",
        },
      ],
    ),
  ).toEqual({ "0:0": 410 });
});
