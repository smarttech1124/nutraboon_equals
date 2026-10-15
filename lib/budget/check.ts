import type { SafetyViolation } from "@/lib/safety/reply-check";
import { roundNaira, type ShoppingRequest } from "./calculate";
import { unverifiedAmounts } from "./money";
import type { PriceBook } from "./prices";
import { buildBudgetSummary, formatNaira } from "./summary";

/**
 * Budget checks run on every reply (ADR-037):
 * - no naira amount the app did not supply (CLAUDE.md §25: never fabricate prices);
 * - a costed shopping list must fit within the user's budget.
 */
export function checkBudgetReply(
  reply: { message: string; shoppingList?: ShoppingRequest[] },
  context: { budget?: number; book?: PriceBook },
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  const allowed = [
    ...(context.budget !== undefined ? [context.budget] : []),
    ...[...(context.book?.items.values() ?? [])].flatMap((i) => [i.price, roundNaira(i.price)]),
  ];
  for (const amount of unverifiedAmounts(reply.message, allowed)) {
    violations.push({
      kind: "price",
      term: `₦${amount.toLocaleString("en-NG")}`,
      reason:
        "a money amount the app did not provide; never write totals, costs or prices that are not in VERIFIED DATA",
    });
  }

  if (context.budget !== undefined && context.book && reply.shoppingList?.length) {
    // Compare the total the user will see, so the card never shows "over budget".
    const { estimatedTotal } = buildBudgetSummary(reply.shoppingList, context.book, {
      budget: context.budget,
    });
    if (estimatedTotal > context.budget) {
      violations.push({
        kind: "budget",
        term: "shoppingList",
        reason: `its estimated cost (${formatNaira(estimatedTotal)}) is over the ${formatNaira(context.budget)} budget; buy less or cheaper items`,
      });
    }
  }
  return violations;
}
