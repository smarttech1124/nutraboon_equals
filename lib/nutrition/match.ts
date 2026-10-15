import type { AliasEntry } from "./types";

/** Lowercase, strip accents and punctuation, collapse spaces. Used for aliases and messages alike. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type AliasIndex = {
  /** normalised alias -> food id */
  byAlias: Map<string, string>;
  /** longest alias, in words, so the scan window is bounded */
  maxWords: number;
};

export function buildAliasIndex(entries: AliasEntry[]): AliasIndex {
  const byAlias = new Map<string, string>();
  let maxWords = 1;
  for (const { alias, foodId } of entries) {
    const key = normalizeText(alias);
    if (!key) continue;
    byAlias.set(key, foodId);
    maxWords = Math.max(maxWords, key.split(" ").length);
  }
  return { byAlias, maxWords };
}

/**
 * Finds foods named in a message, in the order they appear. Longest phrase
 * wins ("groundnut oil" beats "groundnut"), matches never overlap, and only
 * whole words match. Returns distinct food ids, at most `limit`.
 */
export function findFoodMentions(message: string, index: AliasIndex, limit = 3): string[] {
  const words = normalizeText(message).split(" ").filter(Boolean);
  const found: string[] = [];

  let i = 0;
  while (i < words.length && found.length < limit) {
    let matched = 0;
    for (let n = Math.min(index.maxWords, words.length - i); n >= 1; n--) {
      const foodId = index.byAlias.get(words.slice(i, i + n).join(" "));
      if (foodId) {
        if (!found.includes(foodId)) found.push(foodId);
        matched = n;
        break;
      }
    }
    i += matched || 1;
  }
  return found;
}
