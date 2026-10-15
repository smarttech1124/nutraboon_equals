import { z } from "zod";
import { normalizeText } from "./match";
import { NUTRIENT_FIELDS, type AliasEntry, type FoodRecord } from "./types";

const nutrientsSchema = z.object(
  Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, z.number().nonnegative().nullable()])) as {
    [K in (typeof NUTRIENT_FIELDS)[number]]: z.ZodNullable<z.ZodNumber>;
  },
);

const seedFoodSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  category: z.enum([
    "fruit",
    "vegetable",
    "grain",
    "legume",
    "nut_seed",
    "tuber",
    "egg",
    "meat",
    "fish",
    "dairy",
    "oil",
  ]),
  aliases: z.array(z.string().min(1)).min(1),
  allergens: z.array(z.string().min(1)),
  scientificName: z.string().nullable(),
  per100g: nutrientsSchema,
  serving: z
    .object({
      label: z.string().min(1),
      grams: z.number().positive(),
      source: z.string().min(1),
      sourceUrl: z.url(),
      sourceVersion: z.string().min(1),
      sourceRef: z.string().min(1),
    })
    .nullable(),
  source: z.string().min(1),
  sourceUrl: z.url(),
  sourceVersion: z.string().min(1),
  sourceFoodCode: z.string().min(1),
  sourceFoodName: z.string().min(1),
  retrievedAt: z.iso.date(),
});

export const seedFileSchema = z.object({ foods: z.array(seedFoodSchema).min(1) });

export type SeedFood = z.infer<typeof seedFoodSchema>;

/**
 * Validates prisma/seed/foods.json and checks that every alias is unique after
 * normalisation, so lookups can never be ambiguous.
 */
export function parseSeedFile(json: unknown): { foods: SeedFood[]; aliases: AliasEntry[] } {
  const { foods } = seedFileSchema.parse(json);
  const owner = new Map<string, string>();
  const ids = new Set<string>();

  for (const food of foods) {
    if (ids.has(food.id)) throw new Error(`Duplicate food id "${food.id}"`);
    ids.add(food.id);
    for (const raw of food.aliases) {
      const alias = normalizeText(raw);
      const existing = owner.get(alias);
      if (existing && existing !== food.id) {
        throw new Error(`Alias "${alias}" is used by both "${existing}" and "${food.id}"`);
      }
      owner.set(alias, food.id);
    }
  }
  return {
    foods,
    aliases: [...owner].map(([alias, foodId]) => ({ alias, foodId })),
  };
}

export function seedFoodToRecord(food: SeedFood): FoodRecord {
  return {
    id: food.id,
    name: food.name,
    category: food.category,
    allergens: food.allergens,
    per100g: food.per100g,
    serving: food.serving && {
      label: food.serving.label,
      grams: food.serving.grams,
      source: food.serving.source,
      sourceUrl: food.serving.sourceUrl,
    },
    source: food.source,
    sourceUrl: food.sourceUrl,
    sourceVersion: food.sourceVersion,
    sourceFoodCode: food.sourceFoodCode,
    sourceFoodName: food.sourceFoodName,
  };
}
