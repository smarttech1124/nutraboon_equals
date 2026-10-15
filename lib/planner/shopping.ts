import type { PriceBook } from "@/lib/budget/prices";
import { findFoodMentions, normalizeText } from "@/lib/nutrition/match";
import type { PlannerDay } from "./schema";

/**
 * Shopping list for a week, aggregated and costed by code (ADR-066).
 * Costs come only from estimate prices whose unit is a weight or a count we
 * can convert to; anything else is listed without a price, never guessed.
 */

/** Processed forms that must not be priced as the raw food (tomato paste is not tomatoes). */
const PROCESSED =
  /\b(paste|powder|puree|canned|tinned|sauce|juice|flour|concentrate|seasoning|cube)\b/;

/** Cooking oils weigh about 0.92 g per ml. */
const OIL_G_PER_ML = 0.92;

export type ShoppingLine = {
  name: string;
  /** Amounts as written in the plan, e.g. ["2 cups", "1 cup"]. */
  amounts: string[];
  grams?: number;
  pieces?: number;
  /** Estimated cost in naira, when priceable. */
  cost?: number;
  priceItem?: string;
  unitLabel?: string;
};

export type ShoppingList = {
  lines: ShoppingLine[];
  /** Sum of priced lines only. */
  total: number;
  pricedCount: number;
  source?: { name: string; url: string; month: string; region: string };
};

export function buildShoppingList(days: PlannerDay[], book: PriceBook | null): ShoppingList {
  const byName = new Map<string, ShoppingLine>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        const key = normalizeText(ing.name);
        const line = byName.get(key) ?? { name: ing.name, amounts: [] };
        line.amounts.push(ing.amount);
        if (ing.grams) line.grams = (line.grams ?? 0) + ing.grams;
        if (ing.pieces) line.pieces = (line.pieces ?? 0) + ing.pieces;
        byName.set(key, line);
      }
    }
  }

  let total = 0;
  let pricedCount = 0;
  let source: ShoppingList["source"];
  for (const line of byName.values()) {
    if (!book) continue;
    const [id] = findFoodMentions(line.name, book.index, 1);
    const item = id ? book.items.get(id) : undefined;
    if (!item?.unitQuantity || !item.unitMeasure) continue;
    const processed = normalizeText(line.name).match(PROCESSED)?.[1];
    if (processed && !normalizeText(item.name).includes(processed)) continue;
    const isOil = /\boil\b/.test(normalizeText(line.name));
    const amount =
      item.unitMeasure === "piece"
        ? line.pieces
        : item.unitMeasure === "g"
          ? line.grams
          : item.unitMeasure === "ml" && isOil && line.grams
            ? line.grams / OIL_G_PER_ML
            : undefined;
    if (!amount) continue;
    const cost = (amount / item.unitQuantity) * item.price;
    line.cost = cost;
    line.priceItem = item.name;
    line.unitLabel = item.unitLabel;
    total += cost;
    pricedCount++;
    source ??= {
      name: item.source,
      url: item.sourceUrl,
      month: item.effectiveMonth,
      region: item.region,
    };
  }
  const lines = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { lines, total, pricedCount, ...(source ? { source } : {}) };
}
