import { NUTRIENT_FIELDS, type NutrientField, type NutrientValues } from "./types";

/** Nutrients for `grams` of a food, from its per-100 g values (ADR-005). */
export function scaleNutrients(per100g: NutrientValues, grams: number): NutrientValues {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`Invalid portion weight: ${grams}`);
  }
  const factor = grams / 100;
  const out = {} as NutrientValues;
  for (const field of NUTRIENT_FIELDS) {
    const value = per100g[field];
    out[field] = value === null ? null : value * factor;
  }
  return out;
}

export type PortionInput = { per100g: NutrientValues; grams: number };

/**
 * Sums nutrients across portions. A nutrient is null in the total when any
 * portion lacks it, so a partial sum is never presented as complete.
 */
export function calculateNutrition(portions: PortionInput[]): NutrientValues {
  const total = {} as NutrientValues;
  for (const field of NUTRIENT_FIELDS) total[field] = 0;

  for (const { per100g, grams } of portions) {
    const scaled = scaleNutrients(per100g, grams);
    for (const field of NUTRIENT_FIELDS) {
      const current = total[field];
      const value = scaled[field];
      total[field] = current === null || value === null ? null : current + value;
    }
  }
  return total;
}

/**
 * Display rounding that avoids false precision: energy to whole numbers,
 * micrograms to whole numbers, everything else to 1 decimal below 10 and
 * whole numbers from 10 up.
 */
export function roundNutrient(field: NutrientField, value: number): number {
  if (field === "energyKcal" || field === "energyKj" || field.endsWith("Mcg")) {
    return Math.round(value);
  }
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}
