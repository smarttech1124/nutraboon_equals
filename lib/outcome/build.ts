import type { BudgetSummary } from "@/lib/budget/summary";
import { formatNaira } from "@/lib/budget/summary";
import type { MealPlan } from "@/lib/meals/plan";
import { roundNutrient, scaleNutrients } from "@/lib/nutrition/calculate";
import { NUTRIENT_DISPLAY } from "@/lib/nutrition/facts";
import { normalizeText } from "@/lib/nutrition/match";
import type { NutrientThresholds } from "@/lib/nutrition/service";
import type { FoodRecord, NutrientField } from "@/lib/nutrition/types";

/**
 * The outcome shown at the top of a reply (ADR-051): "don't just answer,
 * produce a useful outcome". Everything here is built by code from validated
 * data: titles, per-meal costs and nutrition highlights never come from the
 * model's own words or numbers.
 */
export type Outcome = {
  kind: "meal_plan" | "budget_plan" | "shopping_list" | "food_facts";
  title: string;
  /** e.g. "For 3 people • 1 day" */
  subtitle?: string;
  /** Estimated cost of the purchases for each meal, keyed "dayIndex:mealIndex". */
  mealCosts?: Record<string, number>;
  /** Nutrients the suggested foods are rich in, among the foods in our data. */
  nutritionFocus?: { nutrient: string; foods: string[] }[];
  /** Per-serving facts for the foods asked about, calculated from verified data. */
  foodFacts?: FoodFacts[];
};

export type FoodFacts = {
  name: string;
  /** e.g. "1 medium (about 140 g)" or "100 g" */
  amount: string;
  nutrients: { label: string; value: number; unit: string }[];
  /** Nutrients this food is rich in, among the foods in our data. */
  richIn: string[];
};

/** Nutrients worth highlighting in a nutrition focus, in display order. */
const FOCUS: { field: NutrientField; label: string }[] = [
  { field: "proteinG", label: "Protein" },
  { field: "energyKcal", label: "Energy" },
  { field: "ironMg", label: "Iron" },
  { field: "vitaminARaeMcg", label: "Vitamin A" },
  { field: "vitaminCMg", label: "Vitamin C" },
  { field: "calciumMg", label: "Calcium" },
  { field: "fiberG", label: "Fibre" },
  { field: "folateDfeMcg", label: "Folate" },
  { field: "zincMg", label: "Zinc" },
  { field: "potassiumMg", label: "Potassium" },
];
export const MAX_FOCUS_NUTRIENTS = 4;
const MAX_FOCUS_FOODS = 3;

/** Nutrients for which `food` is in the top quarter of the dataset (per 100 g). */
export function richIn(food: FoodRecord, thresholds: NutrientThresholds): string[] {
  return FOCUS.filter(({ field }) => {
    const value = food.per100g[field];
    const cut = thresholds[field];
    return value !== null && cut !== undefined && value >= cut;
  }).map((f) => f.label);
}

export function nutritionFocus(
  foods: FoodRecord[],
  thresholds: NutrientThresholds,
): Outcome["nutritionFocus"] {
  const focus = FOCUS.map(({ field, label }) => {
    const cut = thresholds[field];
    const rich = foods
      .filter((f) => cut !== undefined && (f.per100g[field] ?? -1) >= cut)
      .sort((a, b) => (b.per100g[field] ?? 0) - (a.per100g[field] ?? 0))
      .slice(0, MAX_FOCUS_FOODS)
      .map((f) => f.name);
    return { nutrient: label, foods: rich };
  }).filter((n) => n.foods.length > 0);
  return focus.length > 0 ? focus.slice(0, MAX_FOCUS_NUTRIENTS) : undefined;
}

const FACT_FIELDS: NutrientField[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];

export function foodFacts(food: FoodRecord, thresholds: NutrientThresholds): FoodFacts {
  const grams = food.serving?.grams ?? 100;
  const values = scaleNutrients(food.per100g, grams);
  const rich = richIn(food, thresholds);
  // Main nutrients, plus the vitamins and minerals this food stands out for.
  const richFields = FOCUS.filter((f) => rich.includes(f.label)).map((f) => f.field);
  const fields = [...new Set([...FACT_FIELDS, ...richFields])];
  const nutrients = NUTRIENT_DISPLAY.filter(
    (d) => fields.includes(d.field) && values[d.field] !== null,
  ).map((d) => ({
    label: d.label.charAt(0).toUpperCase() + d.label.slice(1),
    value: roundNutrient(d.field, values[d.field]!),
    unit: d.unit,
  }));
  return {
    name: food.name,
    amount: food.serving ? `${food.serving.label} (about ${Math.round(grams)} g)` : "100 g",
    nutrients,
    richIn: rich,
  };
}

const FILLER = new Set(["and", "with", "a", "the", "of", "in", "plus"]);
const dishWords = (name: string) =>
  [
    ...new Set(
      normalizeText(name)
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !FILLER.has(w)),
    ),
  ]
    .sort()
    .join(" ");
/** The same dish, allowing other word order or joining words ("garri and soaked beans"). */
const sameDish = (a: string, b: string) => dishWords(a) === dishWords(b);

/** Sums each meal's purchases. Items not tied to a meal are left out. */
export function costMeals(
  plan: MealPlan,
  purchases: BudgetSummary["purchases"],
): Record<string, number> | undefined {
  const costs: Record<string, number> = {};
  plan.days.forEach((day, d) =>
    day.meals.forEach((meal, m) => {
      const lines = purchases.filter((p) => p.forMeal && sameDish(p.forMeal, meal.name));
      if (lines.length > 0) costs[`${d}:${m}`] = lines.reduce((s, p) => s + p.estimatedCost, 0);
    }),
  );
  return Object.keys(costs).length > 0 ? costs : undefined;
}

export type OutcomeInput = {
  mealPlan?: MealPlan;
  budget?: BudgetSummary;
  /** Foods the user asked about, with verified data. */
  askedFoods: FoodRecord[];
  /** Verified records for the foods the reply suggests (plan, shopping list). */
  suggestedFoods: FoodRecord[];
  thresholds?: NutrientThresholds;
  people?: number;
  /** The user's food budget, when known, even if nothing needs buying. */
  budgetNaira?: number;
};

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const people = (n: number) => (n === 1 ? "For 1 person" : `For ${n} people`);

/** Builds the outcome for a reply, or undefined when it is plain conversation. */
export function buildOutcome(input: OutcomeInput): Outcome | undefined {
  const { mealPlan, budget, thresholds } = input;
  const focus = thresholds ? nutritionFocus(input.suggestedFoods, thresholds) : undefined;

  if (mealPlan || budget) {
    const dayCount = mealPlan?.days.length;
    const budgetNaira = budget?.budget ?? input.budgetNaira;
    const amount = budgetNaira !== undefined ? `${formatNaira(budgetNaira)} ` : "";
    const kind: Outcome["kind"] = mealPlan
      ? "meal_plan"
      : budget?.budget !== undefined
        ? "budget_plan"
        : "shopping_list";
    const title = mealPlan
      ? `Your ${amount}${dayCount && dayCount > 1 ? `${dayCount}-day ` : ""}meal plan`
      : budget?.budget !== undefined
        ? `Your ${amount}food plan`
        : "Your shopping list";
    const subtitle = [input.people ? people(input.people) : "", dayCount ? days(dayCount) : ""]
      .filter(Boolean)
      .join(" • ");
    const mealCosts = mealPlan && budget ? costMeals(mealPlan, budget.purchases) : undefined;
    return {
      kind,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(mealCosts ? { mealCosts } : {}),
      ...(focus ? { nutritionFocus: focus } : {}),
    };
  }

  if (input.askedFoods.length > 0 && thresholds) {
    const names = input.askedFoods.map((f) => f.name);
    return {
      kind: "food_facts",
      title: names.length === 1 ? `${names[0]} at a glance` : names.join(" vs "),
      foodFacts: input.askedFoods.map((f) => foodFacts(f, thresholds)),
    };
  }
  return undefined;
}
