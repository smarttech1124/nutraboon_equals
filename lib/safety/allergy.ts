import { normalizeText } from "@/lib/nutrition/match";
import {
  ALLERGEN_KEYS,
  ALLERGENS,
  GROUP_TERMS,
  PHRASE_OVERRIDES,
  type AllergenKey,
} from "./allergens";

/**
 * Deterministic allergy handling (ADR-009, ADR-017, ADR-031):
 * - detectDeclaredAllergies: finds allergy statements in a user message.
 * - findAllergenMentions: finds words that mean a food containing an allergen.
 * - validateReply: rejects replies that suggest a declared allergen.
 */

type TermIndex = { byPhrase: Map<string, AllergenKey[]>; maxWords: number };

function buildTermIndex(): TermIndex {
  const byPhrase = new Map<string, AllergenKey[]>();
  const add = (phrase: string, keys: AllergenKey[]) => {
    const base = normalizeText(phrase);
    for (const form of [base, `${base}s`, `${base}es`]) {
      byPhrase.set(form, [...new Set([...(byPhrase.get(form) ?? []), ...keys])]);
    }
  };
  for (const key of ALLERGEN_KEYS) for (const term of ALLERGENS[key].terms) add(term, [key]);
  for (const [term, keys] of Object.entries(GROUP_TERMS)) add(term, keys);
  // Overrides replace, not merge, so they are applied last with set().
  for (const [phrase, keys] of Object.entries(PHRASE_OVERRIDES)) {
    const base = normalizeText(phrase);
    for (const form of [base, `${base}s`]) byPhrase.set(form, keys);
  }
  const maxWords = Math.max(...[...byPhrase.keys()].map((p) => p.split(" ").length));
  return { byPhrase, maxWords };
}

const INDEX = buildTermIndex();

export type AllergenMention = {
  /** The matched words, normalised (e.g. "groundnut oil"). */
  term: string;
  allergens: AllergenKey[];
  /** Word offset in the normalised text. */
  position: number;
};

/** All allergen words in a text, longest phrase first, non-overlapping. */
export function findAllergenTerms(text: string): AllergenMention[] {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const found: AllergenMention[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = 0;
    for (let n = Math.min(INDEX.maxWords, words.length - i); n >= 1; n--) {
      const term = words.slice(i, i + n).join(" ");
      const allergens = INDEX.byPhrase.get(term);
      if (allergens) {
        if (allergens.length > 0) found.push({ term, allergens, position: i });
        matched = n;
        break;
      }
    }
    i += matched || 1;
  }
  return found;
}

/** Mentions of foods that contain any of the given allergens. */
export function findAllergenMentions(text: string, allergies: string[]): AllergenMention[] {
  if (allergies.length === 0) return [];
  return findAllergenTerms(text)
    .map((m) => ({ ...m, allergens: m.allergens.filter((a) => allergies.includes(a)) }))
    .filter((m) => m.allergens.length > 0);
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DECLARATION_CUE =
  /\b(allergic|allergy|allergies|intolerant|intolerance|can t (eat|have|take)|cannot (eat|have|take)|must not (eat|have)|mustn t (eat|have)|reacts? to|avoid|avoids|avoiding)\b/;
const NEGATED_ALLERGY =
  /\b(not|no|isn t|aren t|isnt|arent|never|doesn t|don t|hasn t|haven t)\b( \w+){0,2} (allergic|allergy|allergies|intolerant)\b/;
const EXCEPTION_CUE = /\b(except|apart from|other than|but|only to)\b/;

/**
 * Allergen keys the user declares in a message, e.g. "my youngest is allergic
 * to peanuts" → ["peanut"]. Negated statements ("no allergies", "she isn't
 * allergic to eggs") declare nothing, except for what follows "except"/"but".
 */
export function detectDeclaredAllergies(message: string): AllergenKey[] {
  const keys = new Set<AllergenKey>();
  for (const raw of sentences(message)) {
    const sentence = normalizeText(raw);
    if (!DECLARATION_CUE.test(sentence)) continue;

    let scope = sentence;
    if (NEGATED_ALLERGY.test(sentence)) {
      const exception = EXCEPTION_CUE.exec(sentence);
      if (!exception) continue;
      scope = sentence.slice(exception.index);
    }
    for (const mention of findAllergenTerms(scope)) {
      for (const key of mention.allergens) keys.add(key);
    }
  }
  return [...keys];
}

/** True when the user says nobody has allergies ("no allergies", "none of us is allergic"). */
export function detectNoAllergies(message: string): boolean {
  return sentences(message).some((raw) => {
    const s = normalizeText(raw);
    return (
      (NEGATED_ALLERGY.test(s) || /\bnone of (us|them)\b.*\ballerg/.test(s)) &&
      !EXCEPTION_CUE.test(s) &&
      findAllergenTerms(s).length === 0
    );
  });
}

/**
 * Foods in a user message that contain a declared allergen, ignoring the
 * sentences that declare allergies ("she is allergic to peanuts") so only
 * real conflicts remain ("we have groundnut oil").
 */
export function findConflictingMentions(message: string, allergies: string[]): AllergenMention[] {
  return sentences(message)
    .filter((s) => !DECLARATION_CUE.test(normalizeText(s)))
    .flatMap((s) => findAllergenMentions(s, allergies));
}

/**
 * Anywhere in a sentence, these mean an allergen is being excluded, not
 * suggested. Kept to allergy-specific words: generic ones like "don't" also
 * appear in ordinary advice ("don't forget the groundnut oil").
 */
const AVOIDANCE_CUE = /\b(allerg\w*|left out|leave out|leaving out|exclud\w*|unsafe|not safe)\b/;
/** These only exclude what comes after them ("use palm oil instead of groundnut oil"). */
const SUBSTITUTION_CUE =
  /\b(without|instead of|rather than|in place of|replace|swap|avoid\w*|do not (use|give|add|eat)|don t (use|give|add|eat)|never (use|give|add|eat))\b/g;

function isExcludedInSentence(sentence: string, mention: AllergenMention): boolean {
  if (AVOIDANCE_CUE.test(sentence)) return true;
  const words = sentence.split(" ");
  const after = words[mention.position + mention.term.split(" ").length];
  if (after === "free") return true; // "peanut free"
  for (const cue of sentence.matchAll(SUBSTITUTION_CUE)) {
    const cueWord = sentence.slice(0, cue.index).split(" ").filter(Boolean).length;
    if (cueWord <= mention.position) return true;
  }
  return false;
}

export type AllergyViolation = {
  allergen: AllergenKey;
  term: string;
  where: "recommendedFoods" | "message";
};

/**
 * Checks a reply against declared allergies. Every recommended food is
 * checked strictly. In the message, a sentence may name an allergen only to
 * exclude it ("I left out groundnut oil because of the peanut allergy").
 */
export function validateReply(
  reply: { message: string; recommendedFoods?: string[] },
  allergies: string[],
): AllergyViolation[] {
  if (allergies.length === 0) return [];
  const violations: AllergyViolation[] = [];

  for (const food of reply.recommendedFoods ?? []) {
    for (const m of findAllergenMentions(food, allergies)) {
      for (const allergen of m.allergens) {
        violations.push({ allergen, term: m.term, where: "recommendedFoods" });
      }
    }
  }

  for (const raw of sentences(reply.message)) {
    const sentence = normalizeText(raw);
    for (const m of findAllergenMentions(sentence, allergies)) {
      if (isExcludedInSentence(sentence, m)) continue;
      for (const allergen of m.allergens) {
        violations.push({ allergen, term: m.term, where: "message" });
      }
    }
  }
  return violations;
}

export function allergenLabel(key: string): string {
  return key in ALLERGENS ? ALLERGENS[key as AllergenKey].label : key;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Lines for the CURRENT USER CONTEXT prompt layer. */
export function allergyContextLines(
  allergies: string[],
  userMentions: AllergenMention[],
): string[] {
  if (allergies.length === 0) return [];
  const lines = allergies.map((key) => {
    const terms = key in ALLERGENS ? ALLERGENS[key as AllergenKey].terms.join(", ") : key;
    return `Declared allergy or food to avoid: ${allergenLabel(key)}. This is a hard exclusion that the app checks in every reply. Never suggest these or anything made with them: ${terms}.`;
  });
  if (userMentions.length > 0) {
    const items = userMentions.map(
      (m) => `${m.term} (${m.allergens.map(allergenLabel).join(", ")})`,
    );
    lines.push(
      `The user just mentioned foods that contain a declared allergen: ${items.join(", ")}. Do not use them in suggestions; briefly tell the user why.`,
    );
  }
  return lines;
}

/**
 * App-written note shown with the reply (CLAUDE.md §23: make the exclusion
 * visible). Only produced when the reply suggests foods or the user named a
 * food that conflicts with a declared allergy.
 */
export function allergyNotice(
  allergies: string[],
  userMentions: AllergenMention[],
  suggestsFoods: boolean,
): string | undefined {
  if (allergies.length === 0) return undefined;
  if (userMentions.length > 0) {
    const items = [...new Map(userMentions.map((m) => [m.term, m])).values()].map(
      (m) => `${m.term} contains ${listJoin(m.allergens.map(allergenLabel))}`,
    );
    const pronoun = items.length > 1 ? "they're" : "it's";
    return `Heads-up: ${listJoin(items)}, which you said must be avoided, so ${pronoun} left out.`;
  }
  if (suggestsFoods) {
    const verb = allergies.length > 1 ? "they" : "it";
    return `Leaving out ${listJoin(allergies.map(allergenLabel))} because you said ${verb} must be avoided.`;
  }
  return undefined;
}

export function allergyFallbackMessage(allergies: string[]): string {
  const labels = listJoin(allergies.map(allergenLabel));
  return `I want to keep this safe for the ${labels} allergy, and I couldn't put together suggestions that reliably leave it out. Could you tell me which foods you'd like to use? I'll make sure ${labels} stays out.`;
}
