/**
 * Turns a reply into text that reads well aloud (ADR-043): naira amounts as
 * words, list bullets and emoji removed, and safety notices in a fixed order
 * with the urgent-care notice first.
 */

/** "₦2,000" → "2,000 naira"; "₦1.5k" stays readable as "1.5 thousand naira". */
export function nairaForSpeech(text: string): string {
  return text
    .replace(/₦\s?(\d[\d,]*(?:\.\d+)?)\s?k\b/gi, "$1 thousand naira")
    .replace(/₦\s?(\d[\d,]*(?:\.\d+)?)/g, "$1 naira");
}

export function cleanForSpeech(text: string): string {
  return nairaForSpeech(text)
    .replace(/^\s*[-•*]\s+/gm, "") // list bullets
    .replace(/\p{Extended_Pictographic}️?/gu, "") // emoji such as ⚠️ 🛡️
    .replace(/([.:!?])\s*\n+\s*/g, "$1 ") // a line that already ends a sentence
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.(\s*\.)+/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type SpokenReply = {
  message: string;
  /** Spoken summary of the outcome card, read after any urgent notice. */
  outcome?: string;
  urgentNotice?: string;
  allergyNotice?: string;
  safetyNotice?: string;
};

/** The text read aloud for a reply. The urgent notice always comes first. */
export function speechForReply(reply: SpokenReply): string {
  return [reply.urgentNotice, reply.outcome, reply.message, reply.allergyNotice, reply.safetyNotice]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(cleanForSpeech)
    .join(" ");
}

type OutcomeForSpeech = {
  title?: string;
  subtitle?: string;
  meals?: { label: string; name: string; cost?: number; why?: string }[];
  total?: number;
  remaining?: number;
};

/**
 * A short spoken summary of an outcome card (ADR-051): its title, each meal
 * and the budget result. The card itself carries the detail.
 */
export function outcomeForSpeech(outcome: OutcomeForSpeech): string {
  const parts: string[] = [];
  if (outcome.title) parts.push(`${outcome.title}.`);
  if (outcome.subtitle) parts.push(`${outcome.subtitle.replace(/\s*•\s*/g, ", ")}.`);
  for (const meal of outcome.meals ?? []) {
    parts.push(
      `${meal.label}: ${meal.name}${meal.cost !== undefined ? `, about ₦${meal.cost.toLocaleString("en-NG")}` : ""}.${meal.why ? ` ${meal.why}` : ""}`,
    );
  }
  if (outcome.total !== undefined) {
    parts.push(`Estimated total ₦${outcome.total.toLocaleString("en-NG")}.`);
  }
  if (outcome.remaining !== undefined) {
    parts.push(
      outcome.remaining >= 0
        ? `About ₦${outcome.remaining.toLocaleString("en-NG")} left.`
        : `About ₦${(-outcome.remaining).toLocaleString("en-NG")} over budget.`,
    );
  }
  return cleanForSpeech(parts.join(" "));
}
