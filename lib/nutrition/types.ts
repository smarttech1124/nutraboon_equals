export const NUTRIENT_FIELDS = [
  "energyKcal",
  "energyKj",
  "waterG",
  "proteinG",
  "fatG",
  "carbohydrateG",
  "fiberG",
  "calciumMg",
  "ironMg",
  "potassiumMg",
  "sodiumMg",
  "zincMg",
  "vitaminARaeMcg",
  "vitaminCMg",
  "folateDfeMcg",
] as const;

export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

/** Values for a stated quantity. null means the source has no value. */
export type NutrientValues = Record<NutrientField, number | null>;

export type Serving = {
  label: string;
  grams: number;
  source: string;
  sourceUrl: string;
};

export type FoodRecord = {
  id: string;
  name: string;
  category: string;
  allergens: string[];
  /** Per 100 g edible portion. */
  per100g: NutrientValues;
  serving: Serving | null;
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  sourceFoodCode: string;
  sourceFoodName: string;
};

/** What the chat API returns to the browser about foods it used. */
export type FoodReference = {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  servingSource?: string;
  servingSourceUrl?: string;
};

export type AliasEntry = { alias: string; foodId: string };
