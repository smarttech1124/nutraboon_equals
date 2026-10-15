import { NUTRIENT_DISPLAY } from "./facts";

/**
 * Nutrient names the assistant may use (ADR-055). Names follow the standard
 * nutrient lists of FAO/INFOODS (component tagnames) and WHO/FAO "Vitamin and
 * mineral requirements in human nutrition" (2nd ed., 2004). Nutrients outside
 * our food data may be named in general terms only ("eggs give choline"),
 * never with an amount; anything not on this list is treated as unverified.
 */
export const VERIFIED_NUTRIENTS: { name: string; aliases: string[] }[] = [
  { name: "energy", aliases: ["calories", "kilocalories"] },
  { name: "protein", aliases: [] },
  { name: "carbohydrate", aliases: ["carbohydrates", "carbs", "starch"] },
  { name: "fat", aliases: ["fats", "healthy fats"] },
  { name: "fibre", aliases: ["fiber", "dietary fibre", "dietary fiber"] },
  { name: "water", aliases: [] },
  { name: "vitamin A", aliases: ["retinol", "beta-carotene"] },
  { name: "vitamin B1", aliases: ["thiamin", "thiamine"] },
  { name: "vitamin B2", aliases: ["riboflavin"] },
  { name: "vitamin B3", aliases: ["niacin"] },
  { name: "vitamin B6", aliases: ["pyridoxine"] },
  { name: "vitamin B12", aliases: ["cobalamin"] },
  { name: "folate", aliases: ["folic acid", "vitamin B9"] },
  { name: "vitamin C", aliases: ["ascorbic acid"] },
  { name: "vitamin D", aliases: [] },
  { name: "vitamin E", aliases: [] },
  { name: "vitamin K", aliases: [] },
  { name: "iron", aliases: [] },
  { name: "zinc", aliases: [] },
  { name: "calcium", aliases: [] },
  { name: "potassium", aliases: [] },
  { name: "magnesium", aliases: [] },
  { name: "iodine", aliases: [] },
  { name: "selenium", aliases: [] },
  { name: "sodium", aliases: ["salt"] },
  { name: "phosphorus", aliases: [] },
  { name: "choline", aliases: [] },
  { name: "omega-3 fatty acids", aliases: ["omega-3", "omega 3"] },
];

/** Vitamin letters on the verified list, e.g. "a", "b12", "c". */
const VITAMIN_IDS = new Set(
  VERIFIED_NUTRIENTS.flatMap((n) => [n.name, ...n.aliases])
    .map((n) => /^vitamin\s+(\w+)$/i.exec(n)?.[1]?.toLowerCase())
    .filter((v): v is string => Boolean(v)),
);

/** Nutrients our food data holds figures for (prompt and outcome card). */
export const DATA_NUTRIENT_LABELS = NUTRIENT_DISPLAY.map((d) => d.label);

/** "vitamin B17", "vitamin P": vitamin names not on the verified list. */
export function findUnverifiedVitamins(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bvitamins?\s+([a-z]\d{0,2})\b/gi)) {
    const id = match[1].toLowerCase();
    if (!VITAMIN_IDS.has(id)) found.push(match[0]);
  }
  return [...new Set(found)];
}

/**
 * Nutrient amounts ("60 kcal", "70 mg", "12 g of protein"). Grams alone are
 * left out: "500 g of rice" is a portion, not a nutrition figure.
 */
const NUTRIENT_AMOUNT =
  /\b(\d+(?:[.,]\d+)?)\s?(kcal|kj|mg|mcg|µg|ug|g(?=\s+(?:of\s+)?(?:protein|fat|fibre|fiber|carbohydrates?|sugars?)\b))\b/gi;

function canonicalAmount(value: string, unit: string): string {
  const u = unit.toLowerCase().replace("µg", "mcg").replace(/^ug$/, "mcg");
  return `${value.replace(",", ".")} ${u}`;
}

/** Every nutrient amount in a text, normalised ("60 kcal", "70 mg"). */
export function nutrientAmounts(text: string): string[] {
  return [...text.matchAll(NUTRIENT_AMOUNT)].map((m) => canonicalAmount(m[1], m[2]));
}

/** Every number with a nutrition unit, however written (for the allowed set). */
export function anyNutrientAmounts(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s?(kcal|kj|mg|mcg|µg|ug|g)\b/gi)].map((m) =>
      canonicalAmount(m[1], m[2]),
    ),
  );
}
