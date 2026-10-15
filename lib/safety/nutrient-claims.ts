import {
  anyNutrientAmounts,
  findUnverifiedVitamins,
  nutrientAmounts,
} from "@/lib/nutrition/vocabulary";
import type { SafetyViolation } from "./reply-check";

/**
 * Nutrition claims checked in code (ADR-055, CLAUDE.md §3 "do not fabricate
 * exact nutritional values"):
 * - every nutrient amount must match this turn's VERIFIED DATA (within 10%,
 *   for rounding) or the user's own words, e.g. a label they read out;
 * - vitamin names must be on the verified list (no "vitamin B17").
 * Nutrients we hold no data for may still be named in general terms.
 */
/** Rounding is fine ("about 60 kcal" for 62 kcal): within 10% of a verified figure, same unit. */
const TOLERANCE = 0.1;

function isNearKnown(amount: string, known: Set<string>): boolean {
  const [value, unit] = amount.split(" ");
  const n = Number(value);
  for (const k of known) {
    const [kv, ku] = k.split(" ");
    const m = Number(kv);
    if (ku === unit && Math.abs(n - m) <= Math.max(TOLERANCE * m, 0.05)) return true;
  }
  return false;
}

export function checkNutrientClaims(
  message: string,
  /** conversationText: earlier turns (already checked) and the user's own words. */
  allowed: { verifiedData: string; conversationText: string },
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const known = new Set([
    ...anyNutrientAmounts(allowed.verifiedData),
    ...anyNutrientAmounts(allowed.conversationText),
  ]);
  for (const amount of nutrientAmounts(message)) {
    if (!isNearKnown(amount, known)) {
      violations.push({
        kind: "nutrition",
        term: amount,
        reason:
          "this nutrition figure is not in VERIFIED DATA; give figures only from VERIFIED DATA, otherwise describe the food in general terms",
      });
    }
  }
  // A name the user raised may be discussed ("vitamin B17 is not a real vitamin").
  const raised = new Set(
    findUnverifiedVitamins(allowed.conversationText).map((v) => v.toLowerCase()),
  );
  for (const vitamin of findUnverifiedVitamins(message)) {
    if (raised.has(vitamin.toLowerCase())) continue;
    violations.push({
      kind: "nutrition",
      term: vitamin,
      reason: "this is not a recognised nutrient; use only standard nutrient names",
    });
  }
  return violations;
}
