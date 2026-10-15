import { calculateNutrition, roundNutrient } from "@/lib/nutrition/calculate";
import type { FoodRecord } from "@/lib/nutrition/types";
import type { PlannerDay, PlannerIngredient } from "./schema";

/**
 * Approximate daily nutrition, calculated by the app from the verified food
 * database (CLAUDE.md §12, ADR-066). Weights are the AI's estimates, so the
 * app only counts an ingredient when:
 *
 * - it matches a food in the database, and
 * - its weight is known (grams, or pieces times the food's documented
 *   serving weight) and plausible: at most MAX_GRAMS_PER_PERSON per person in
 *   one meal.
 *
 * The figure is shown only when most ingredients counted (SHOW_THRESHOLD);
 * otherwise the page says it could not be estimated. It is never presented
 * as complete.
 */

export const MAX_GRAMS_PER_PERSON = 400;
export const SHOW_THRESHOLD = 0.6;

export type DayNutrition = {
  energyKcal: number | null;
  proteinG: number | null;
  fiberG: number | null;
  /** Ingredients counted, out of all ingredients that day. */
  counted: number;
  total: number;
};

/** Every ingredient name in the days, for one lookup. */
export function ingredientNames(days: PlannerDay[]): string[] {
  return [
    ...new Set(days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => i.name)))),
  ];
}

/** Grams the app is willing to count for an ingredient, or null. */
export function countableGrams(
  ingredient: PlannerIngredient,
  food: FoodRecord,
  people: number,
): number | null {
  const grams =
    ingredient.grams ??
    (ingredient.pieces && food.serving ? ingredient.pieces * food.serving.grams : undefined);
  if (!grams || grams <= 0) return null;
  return grams <= MAX_GRAMS_PER_PERSON * Math.max(1, people) ? grams : null;
}

/** `foods` maps ingredient names (as written) to verified records. */
export function dayNutrition(
  day: PlannerDay,
  foods: Map<string, FoodRecord>,
  people: number,
): DayNutrition {
  const portions: { per100g: FoodRecord["per100g"]; grams: number }[] = [];
  let total = 0;
  for (const meal of day.meals) {
    for (const ing of meal.ingredients) {
      total++;
      const food = foods.get(ing.name);
      const grams = food ? countableGrams(ing, food, people) : null;
      if (food && grams) portions.push({ per100g: food.per100g, grams });
    }
  }
  if (portions.length === 0) {
    return { energyKcal: null, proteinG: null, fiberG: null, counted: 0, total };
  }
  const sum = calculateNutrition(portions);
  const round = (field: "energyKcal" | "proteinG" | "fiberG") => {
    const v = sum[field];
    return v === null ? null : roundNutrient(field, v);
  };
  return {
    energyKcal: round("energyKcal"),
    proteinG: round("proteinG"),
    fiberG: round("fiberG"),
    counted: portions.length,
    total,
  };
}

/** Whether enough of the day was counted to show a figure at all. */
export function showNutrition(n: DayNutrition | undefined): n is DayNutrition {
  return !!n && n.total > 0 && n.counted / n.total >= SHOW_THRESHOLD;
}
