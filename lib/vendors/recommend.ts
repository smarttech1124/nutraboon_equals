import { normalizeText } from "@/lib/nutrition/match";
import { checkReply } from "@/lib/safety/reply-check";
import type { ProductContext } from "./types";

/**
 * The recommendation engine (ADR-067): deterministic matching of listed
 * products to foods the app is already suggesting. A product is offered only
 * when it is one of those foods, never conflicts with an allergy, a food to
 * avoid or the child and pregnancy rules, and is in stock somewhere.
 */

export type Candidate = {
  id: string;
  name: string;
  ingredients: string[];
  allergens: string[];
  matchTerms: string[];
  availability: string;
  /** States where it can be bought in person; empty means online or unknown. */
  states: string[];
  online: boolean;
};

function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${normalizeText(text)} `;
  const p = normalizeText(phrase);
  return !!p && (t.includes(` ${p} `) || t.includes(` ${p}s `) || t.includes(` ${p}es `));
}

/** The first context term this candidate is, or undefined. */
export function matchedTerm(candidate: Candidate, terms: string[]): string | undefined {
  for (const term of terms) {
    if (candidate.matchTerms.some((m) => containsPhrase(term, m) || containsPhrase(m, term))) {
      return term;
    }
  }
  return undefined;
}

export function isSafeFor(candidate: Candidate, context: ProductContext): boolean {
  if (candidate.allergens.some((a) => context.allergies.includes(a))) return false;
  const violations = checkReply(
    { message: "", planItems: [candidate.name, ...candidate.ingredients] },
    {
      allergies: context.allergies,
      avoidFoods: context.avoidFoods,
      safety: {
        infant: Boolean(context.infant),
        childUnder5: Boolean(context.childUnder5),
        pregnant: Boolean(context.pregnant),
      },
    },
  );
  return violations.length === 0;
}

export function recommend<T extends Candidate>(
  candidates: T[],
  context: ProductContext,
): { candidate: T; term: string }[] {
  const terms = [...new Set(context.terms.map((t) => t.trim()).filter(Boolean))].slice(0, 40);
  const recent = context.recentText?.trim() ?? "";
  if (terms.length === 0 && !recent) return [];
  const scored = candidates.flatMap((candidate) => {
    if (candidate.availability === "out_of_stock") return [];
    // Foods in the reply first; otherwise a food named earlier in the conversation.
    const fromReply = matchedTerm(candidate, terms);
    const term =
      fromReply ??
      (recent ? candidate.matchTerms.find((m) => containsPhrase(recent, m)) : undefined);
    if (!term || !isSafeFor(candidate, context)) return [];
    const nearby = context.state ? candidate.states.includes(context.state) : false;
    // Order: reply foods before earlier ones; in the user's state, then online,
    // then anywhere; earlier terms first.
    const score =
      (fromReply ? 10 : 0) +
      (nearby ? 4 : candidate.online ? 2 : 0) -
      (fromReply ? terms.indexOf(term) : 0) / 100;
    return [{ candidate, term, score }];
  });
  scored.sort((a, b) => b.score - a.score);
  // One product per food, so recommendations stay varied and unintrusive.
  const seenTerms = new Set<string>();
  const out: { candidate: T; term: string }[] = [];
  for (const s of scored) {
    if (seenTerms.has(s.term)) continue;
    seenTerms.add(s.term);
    out.push({ candidate: s.candidate, term: s.term });
    if (out.length >= (context.limit ?? 3)) break;
  }
  return out;
}
