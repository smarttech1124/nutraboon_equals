import { findFoodMentions } from "@/lib/nutrition/match";
import type { PriceBook, PricedItem } from "./prices";

/**
 * Deterministic budget arithmetic (CLAUDE.md §12, ADR-005). The model
 * proposes items and quantities; this module prices and totals them.
 */

export const MAX_BUDGET_NAIRA = 10_000_000;
/** Estimates are shown to the nearest ₦10 to avoid false precision. */
export const DISPLAY_STEP_NAIRA = 10;
/** More units than this of one item is treated as a mistake, not priced. */
export const MAX_QUANTITY = 50;

export function validateBudget(budget: number): boolean {
  return Number.isFinite(budget) && budget > 0 && budget <= MAX_BUDGET_NAIRA;
}

export function roundNaira(value: number, step = DISPLAY_STEP_NAIRA): number {
  return Math.round(value / step) * step;
}

export type ShoppingRequest = {
  item: string;
  quantity: number;
  /** Dish the item is bought for, so the outcome card can cost each meal (ADR-051). */
  forMeal?: string;
};

export type CostedLine = {
  itemId: string;
  name: string;
  /** In the item's unit, e.g. 0.5 for half of "1 kg". */
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  cost: number;
  forMeal?: string;
};

export type CostedList = {
  lines: CostedLine[];
  /** Requested items with no price estimate; never counted in the total. */
  unpriced: string[];
  /** Exact sum of line costs; round only for display. */
  total: number;
};

/** Prices each requested item by name. Unknown items are reported, never guessed. */
export function costShoppingList(requests: ShoppingRequest[], book: PriceBook): CostedList {
  const lines: CostedLine[] = [];
  const unpriced: string[] = [];

  for (const request of requests) {
    const [id] = findFoodMentions(request.item, book.index, 1);
    const item: PricedItem | undefined = id ? book.items.get(id) : undefined;
    if (!item || !(request.quantity > 0) || request.quantity > MAX_QUANTITY) {
      unpriced.push(request.item);
      continue;
    }
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: request.quantity,
      unitLabel: item.unitLabel,
      unitPrice: item.price,
      cost: item.price * request.quantity,
      ...(request.forMeal ? { forMeal: request.forMeal } : {}),
    });
  }
  return { lines, unpriced, total: calculateShoppingTotal(lines) };
}

export function calculateShoppingTotal(lines: { cost: number }[]): number {
  return lines.reduce((sum, line) => sum + line.cost, 0);
}

export function calculateRemainingBudget(budget: number, total: number): number {
  return budget - total;
}
