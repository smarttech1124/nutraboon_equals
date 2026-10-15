import { roundNutrient, scaleNutrients } from "./calculate";
import type { FoodRecord, FoodReference, NutrientField, NutrientValues } from "./types";

/** Order and labels used when presenting nutrients (prompt and outcome card). */
export const NUTRIENT_DISPLAY: { field: NutrientField; label: string; unit: string }[] = [
  { field: "energyKcal", label: "energy", unit: "kcal" },
  { field: "proteinG", label: "protein", unit: "g" },
  { field: "carbohydrateG", label: "carbohydrate", unit: "g" },
  { field: "fatG", label: "fat", unit: "g" },
  { field: "fiberG", label: "fibre", unit: "g" },
  { field: "vitaminARaeMcg", label: "vitamin A (RAE)", unit: "mcg" },
  { field: "vitaminCMg", label: "vitamin C", unit: "mg" },
  { field: "folateDfeMcg", label: "folate (DFE)", unit: "mcg" },
  { field: "calciumMg", label: "calcium", unit: "mg" },
  { field: "ironMg", label: "iron", unit: "mg" },
  { field: "potassiumMg", label: "potassium", unit: "mg" },
  { field: "zincMg", label: "zinc", unit: "mg" },
  { field: "sodiumMg", label: "sodium", unit: "mg" },
];

export function describeNutrients(values: NutrientValues): string {
  return NUTRIENT_DISPLAY.filter(({ field }) => values[field] !== null)
    .map(({ field, label, unit }) => `${label} ${roundNutrient(field, values[field]!)} ${unit}`)
    .join(", ");
}

/**
 * One VERIFIED DATA line per food for the prompt. Per-serving values are
 * calculated here, not by the model (ADR-005).
 */
export function formatFoodFacts(food: FoodRecord): string {
  const parts = [`${food.name} (source entry: "${food.sourceFoodName}", ${food.sourceVersion}).`];
  if (food.serving) {
    const perServing = scaleNutrients(food.per100g, food.serving.grams);
    parts.push(
      `Per ${food.serving.label} (about ${Math.round(food.serving.grams)} g): ${describeNutrients(perServing)}.`,
    );
  }
  parts.push(`Per 100 g: ${describeNutrients(food.per100g)}.`);
  if (food.allergens.length > 0) parts.push(`Common allergen: ${food.allergens.join(", ")}.`);
  return parts.join(" ");
}

export function toFoodReference(food: FoodRecord): FoodReference {
  return {
    id: food.id,
    name: food.name,
    source: food.source,
    sourceUrl: food.sourceUrl,
    ...(food.serving
      ? { servingSource: food.serving.source, servingSourceUrl: food.serving.sourceUrl }
      : {}),
  };
}
