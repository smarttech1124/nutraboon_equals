import type { ChatResponse } from "@/lib/conversation/types";
import type { OutgoingMessage } from "./client";

/** WhatsApp's limit for a text body. */
const MAX_TEXT = 4096;
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * One chat reply as WhatsApp messages (ADR-087): the same words the website
 * shows, as plain text, with the meal plan and shopping list written out
 * (cards cannot be shown), then any reviewed pictures with their caption and
 * credit. Notices keep the website's order: urgent first, safety last.
 */
export function formatReply(reply: ChatResponse): OutgoingMessage[] {
  const m = reply.metadata ?? {};
  const parts: string[] = [];
  if (m.urgentNotice) parts.push(`⚠️ ${m.urgentNotice}`);
  parts.push(reply.message);
  if (m.mealPlan) {
    parts.push(
      m.mealPlan.days
        .map(
          (d) =>
            `*${d.day}*\n${d.meals.map((meal) => `• ${meal.mealType}: ${meal.name}`).join("\n")}`,
        )
        .join("\n\n"),
    );
  }
  if (m.budget && m.budget.purchases.length > 0) {
    const lines = m.budget.purchases.map(
      (p) => `• ${p.name} (${p.quantity} ${p.unitLabel}): about ${naira(p.estimatedCost)}`,
    );
    lines.push(`Estimated total: ${naira(m.budget.estimatedTotal)}`);
    if (m.budget.estimatedRemaining !== undefined) {
      lines.push(`Estimated left over: ${naira(m.budget.estimatedRemaining)}`);
    }
    lines.push(`Prices are estimates (${m.budget.priceSource}), not today's market prices.`);
    parts.push(`*Shopping list*\n${lines.join("\n")}`);
  }
  if (m.allergyNotice) parts.push(`🛡️ ${m.allergyNotice}`);
  if (m.safetyNotice) parts.push(`ℹ️ ${m.safetyNotice}`);

  let body = parts.join("\n\n");
  if (body.length > MAX_TEXT) body = `${body.slice(0, MAX_TEXT - 1).trimEnd()}…`;
  const messages: OutgoingMessage[] = [{ type: "text", body }];
  for (const v of m.visuals ?? []) {
    messages.push({
      type: "image",
      link: v.src,
      caption: `${v.title}: ${v.caption}\nPicture: ${v.credit.author}, ${v.credit.license}, via Wikimedia Commons`,
    });
  }
  return messages;
}
