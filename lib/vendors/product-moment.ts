import type { AssistantResponse, ChatMessage } from "@/lib/conversation/types";

/**
 * When sponsored products may appear in chat (ADR-078). Products are offered
 * only at the right moment, never on every reply that names a food:
 *
 * - "asked": the person asks for products, brands or what to buy;
 * - "purchase": the conversation turns to buying (a shopping list, where to
 *   buy, ordering, prices of a product);
 * - "closing": the person is wrapping up ("thanks, that's all") after a real
 *   conversation, or a finished meal plan has just been delivered.
 *
 * Decided by code from the person's own words and the reply's structure, so
 * the AI cannot push products. English phrases only for now; other reply
 * languages still get products with shopping lists and finished plans.
 */

export type ProductMoment = "asked" | "purchase" | "closing";

const ASKED = [
  /\bproducts?\b/,
  /\bbrands?\b/,
  /\b(suggest|recommend|show|any|which|what)\b.{0,40}\b(to buy|should i (buy|get))\b/,
  /\bwhat (can|should) i (buy|get)\b/,
  /\b(good|best|healthy)\b.{0,20}\b(one|ones|kind) to buy\b/,
];

const PURCHASE = [
  /\b(buy|buying|bought|purchase|purchasing)\b/,
  // "order" as in buying, not "in order to".
  /(?<!\bin )\border(ing)?\b(?! to\b)/,
  /\bshop(ping)?\b/,
  /\bwhere (can|do|should|could) (i|we) (get|find|buy)\b/,
  /\bwhere to (get|find|buy)\b/,
  /\b(sell|sells|seller|sellers|vendor|vendors|stockist)\b/,
  /\b(deliver|delivery|in stock)\b/,
  /\bhow much (is|are|does|do)\b/,
];

/** A new question means the conversation is not ending. */
const QUESTION = /\b(what|how|which|can|could|should|why|when|where|who)\b/;

const CLOSING =
  /^(ok(ay)?|alright|great|perfect|cool|nice|good|got it|noted|sounds good|that'?s (all|it|great|helpful|perfect)|thanks?( you)?|thank u|thx|bye|goodbye|see you)\b/;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productMoment(
  userMessage: string,
  reply: Pick<AssistantResponse, "intent" | "shoppingList" | "mealPlan">,
  history: ChatMessage[],
): ProductMoment | null {
  const text = normalise(userMessage);
  if (ASKED.some((re) => re.test(text))) return "asked";
  if (PURCHASE.some((re) => re.test(text))) return "purchase";
  if (reply.intent === "shopping_list" || (reply.shoppingList?.length ?? 0) > 0) return "purchase";
  // A finished meal plan ends that piece of work.
  if (reply.mealPlan && reply.mealPlan.days.length > 0) return "closing";
  // Wrapping up after at least two replies: short thanks or goodbye, not a new question.
  const priorReplies = history.filter((m) => m.role === "assistant").length;
  if (
    priorReplies >= 2 &&
    text.split(" ").length <= 12 &&
    CLOSING.test(text) &&
    !userMessage.includes("?") &&
    !QUESTION.test(text)
  ) {
    return "closing";
  }
  return null;
}

/**
 * Recent conversation text for "asked" and "closing" moments, when the reply
 * itself names no foods: products can then match foods discussed earlier.
 */
export function recentConversationText(history: ChatMessage[], userMessage: string): string {
  return [...history.slice(-6).map((m) => m.content), userMessage].join("\n").slice(0, 6000);
}
