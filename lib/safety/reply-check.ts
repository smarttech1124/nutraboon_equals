import type { SafetyContext } from "@/lib/conversation/profile";
import { normalizeText } from "@/lib/nutrition/match";
import { allergenLabel, validateReply } from "./allergy";

/**
 * Child-feeding rules checked in code (ADR-035). Kept to widely agreed
 * guidance, e.g. NHS "Foods to avoid giving babies and young children":
 * no honey before 12 months (infant botulism); no whole nuts under 5 (choking).
 */
const INFANT_FORBIDDEN = ["honey"];
const UNDER_5_FORBIDDEN = [
  "whole nuts",
  "whole nut",
  "whole groundnuts",
  "whole groundnut",
  "whole peanuts",
  "whole peanut",
  "roasted groundnuts",
  "roasted peanuts",
  "popcorn",
];

export type SafetyViolation = {
  kind:
    | "allergy"
    | "avoid"
    | "child_safety"
    | "format"
    | "price"
    | "budget"
    | "medical"
    | "medication"
    | "nutrition";
  term: string;
  reason: string;
};

export type ReplyToCheck = {
  message: string;
  recommendedFoods?: string[];
  /** Dish names and foods from a meal plan; checked strictly. */
  planItems?: string[];
};

export type CheckContext = {
  allergies: string[];
  avoidFoods?: string[];
  /** Foods the family cannot afford now (ADR-055); never suggested, like avoidFoods. */
  unaffordableFoods?: string[];
  safety?: SafetyContext;
};

function containsPhrase(text: string, phrase: string): boolean {
  const words = ` ${normalizeText(text)} `;
  const p = normalizeText(phrase);
  return !!p && (words.includes(` ${p} `) || words.includes(` ${p}s `));
}

/**
 * All deterministic checks a reply must pass before the user sees it
 * (ADR-009, ADR-017): declared allergies, other foods to avoid, and
 * child-feeding rules.
 */
export function checkReply(reply: ReplyToCheck, context: CheckContext): SafetyViolation[] {
  const suggested = [...(reply.recommendedFoods ?? []), ...(reply.planItems ?? [])];
  const violations: SafetyViolation[] = validateReply(
    { message: reply.message, recommendedFoods: suggested },
    context.allergies,
  ).map((v) => ({
    kind: "allergy",
    term: v.term,
    reason: `contains ${allergenLabel(v.allergen)}, a declared allergy`,
  }));

  for (const avoid of context.avoidFoods ?? []) {
    for (const item of suggested) {
      if (containsPhrase(item, avoid)) {
        violations.push({ kind: "avoid", term: item, reason: `the user avoids ${avoid}` });
      }
    }
  }

  for (const food of context.unaffordableFoods ?? []) {
    for (const item of suggested) {
      if (containsPhrase(item, food)) {
        violations.push({
          kind: "avoid",
          term: item,
          reason: `the user said they cannot afford ${food}; use a cheaper option`,
        });
      }
    }
  }

  const rules: [string[], string][] = [];
  if (context.safety?.infant) rules.push([INFANT_FORBIDDEN, "not safe for babies under 12 months"]);
  if (context.safety?.childUnder5)
    rules.push([UNDER_5_FORBIDDEN, "a choking risk for children under 5"]);
  for (const [terms, reason] of rules) {
    for (const item of suggested) {
      for (const term of terms) {
        if (containsPhrase(item, term)) violations.push({ kind: "child_safety", term, reason });
      }
    }
  }
  return violations;
}

export function correctionFor(violations: SafetyViolation[]): string {
  const items = [...new Set(violations.map((v) => `${v.term} (${v.reason})`))];
  return `Your previous reply suggested ${items.join("; ")}. Write the reply again without these or anything containing them. Offer safe alternatives instead, and keep them out of recommendedFoods and mealPlan.`;
}
