import {
  calculateRemainingBudget,
  calculateShoppingTotal,
  costShoppingList,
  roundNaira,
  type ShoppingRequest,
} from "./calculate";
import type { PriceBook } from "./prices";
import { REGION_LABEL, type Region } from "./regions";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-05" → "May 2026" */
export function monthLabel(effectiveMonth: string): string {
  const [year, month] = effectiveMonth.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatNaira(value: number): string {
  return `₦${roundNaira(value).toLocaleString("en-NG")}`;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
}

/** What the browser shows for a costed shopping list (metadata.budget). */
export type BudgetSummary = {
  budget?: number;
  region: Region;
  regionLabel: string;
  /** e.g. "NBS Selected Food Price Watch, May 2026" */
  priceSource: string;
  priceSourceUrl: string;
  fromHome: string[];
  purchases: {
    name: string;
    quantity: string;
    unitLabel: string;
    estimatedCost: number;
    /** Dish this purchase is for, when the model said so. */
    forMeal?: string;
  }[];
  unpriced: string[];
  /** Sum of the rounded purchase lines; excludes unpriced items. */
  estimatedTotal: number;
  /** Budget minus estimatedTotal; negative means over budget. Absent when no budget is known. */
  estimatedRemaining?: number;
};

export function buildBudgetSummary(
  requests: ShoppingRequest[],
  book: PriceBook,
  options: { budget?: number; fromHome?: string[] },
): BudgetSummary {
  const costed = costShoppingList(requests, book);
  const anyItem = book.items.values().next().value;
  const month = anyItem ? monthLabel(anyItem.effectiveMonth) : "";
  const regions = new Set(costed.lines.map((l) => book.items.get(l.itemId)?.region));
  const region: Region = regions.size === 1 ? [...regions][0]! : book.region;
  // The shown total is the sum of the shown (rounded) lines, so the card adds
  // up for the reader, and the budget check compares the same figure.
  const purchases = costed.lines.map((l) => ({
    name: l.name,
    quantity: formatQuantity(l.quantity),
    unitLabel: l.unitLabel,
    estimatedCost: roundNaira(l.cost),
    ...(l.forMeal ? { forMeal: l.forMeal } : {}),
  }));
  const shownTotal = calculateShoppingTotal(purchases.map((p) => ({ cost: p.estimatedCost })));

  return {
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    region,
    regionLabel: REGION_LABEL[region],
    priceSource: `NBS Selected Food Price Watch, ${month}`,
    priceSourceUrl: anyItem?.sourceUrl ?? "",
    fromHome: options.fromHome ?? [],
    purchases,
    unpriced: costed.unpriced,
    estimatedTotal: shownTotal,
    ...(options.budget !== undefined
      ? { estimatedRemaining: calculateRemainingBudget(options.budget, shownTotal) }
      : {}),
  };
}

/** VERIFIED DATA lines: every estimate the model may quote, labelled as an estimate. */
export function formatPriceFacts(book: PriceBook): string[] {
  const items = [...book.items.values()];
  if (items.length === 0) return [];
  const header = `Estimated prices (${REGION_LABEL[book.region]}, NBS Selected Food Price Watch, ${monthLabel(items[0].effectiveMonth)}; estimates, not current market prices). In shoppingList, give quantity in each item's unit (e.g. 0.5 for half a kg; 0.2 crate for 6 eggs). Anything not listed has no estimate; still list it in shoppingList and the app will mark it unpriced.`;
  return [
    header,
    ...items.map((i) => `${i.name}: about ${formatNaira(i.price)} per ${i.unitLabel}.`),
  ];
}
