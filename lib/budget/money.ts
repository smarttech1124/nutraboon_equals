import { normalizeText } from "@/lib/nutrition/match";
import { validateBudget } from "./calculate";

/**
 * Naira amounts written in text: "₦2,000", "N2000", "N 1,500", "2000 naira",
 * "2k naira". Returned in order of appearance.
 */
export function extractNairaAmounts(text: string): number[] {
  const amounts: { at: number; value: number }[] = [];
  const toNumber = (digits: string, k?: string) =>
    Number(digits.replace(/,/g, "")) * (k ? 1000 : 1);

  for (const m of text.matchAll(/₦\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi)) {
    amounts.push({ at: m.index, value: toNumber(m[1], m[2]) });
  }
  // "N2,000": a capital N directly before at least three digits, so "N5" in prose is ignored.
  for (const m of text.matchAll(/\bN\s?(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?\b/g)) {
    amounts.push({ at: m.index, value: toNumber(m[1]) });
  }
  for (const m of text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?naira\b/gi)) {
    amounts.push({ at: m.index, value: toNumber(m[1], m[2]) });
  }
  return amounts
    .filter((a) => Number.isFinite(a.value) && a.value > 0)
    .sort((a, b) => a.at - b.at)
    .map((a) => a.value);
}

const BUDGET_CUE =
  /\b(i have|we have|i ve got|we ve got|have only|only have|budget|spend|with|i get|left with)\b/;

/** A food budget stated by the user, e.g. "I have ₦2,000. What can I cook?" */
export function detectBudget(message: string): number | undefined {
  if (!BUDGET_CUE.test(normalizeText(message))) return undefined;
  const [amount] = extractNairaAmounts(message);
  return amount !== undefined && validateBudget(amount) ? amount : undefined;
}

/**
 * Naira amounts in a reply that do not come from the app (CLAUDE.md §25:
 * never fabricate prices). An amount is allowed if it is within ₦10 or 2%
 * of an allowed value, e.g. the user's budget or a provided estimate.
 */
export function unverifiedAmounts(message: string, allowed: number[]): number[] {
  return extractNairaAmounts(message).filter(
    (amount) => !allowed.some((a) => Math.abs(a - amount) <= Math.max(10, a * 0.02)),
  );
}
