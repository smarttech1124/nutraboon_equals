import { buildAliasIndex, findFoodMentions, type AliasIndex } from "./match";
import type { FoodRepository } from "./repository";
import { NUTRIENT_FIELDS, type FoodRecord, type NutrientField } from "./types";

/** Aliases only change when the seed is re-run, so a short cache is safe. */
const ALIAS_CACHE_MS = 10 * 60 * 1000;
export const MAX_FOODS_PER_MESSAGE = 3;
/** At most this many named foods are looked up for one outcome card. */
export const MAX_FOODS_PER_OUTCOME = 40;

/**
 * Per nutrient, the per-100 g value at the 75th percentile of the dataset.
 * A food at or above it is "among the richer foods in our data" (ADR-051).
 */
export type NutrientThresholds = Partial<Record<NutrientField, number>>;

export interface NutritionLookup {
  findFoodsInMessage(message: string): Promise<FoodRecord[]>;
  /** Verified records for food names (e.g. a meal plan's ingredients). Optional for fakes. */
  findFoods?(names: string[]): Promise<FoodRecord[]>;
  nutrientThresholds?(): Promise<NutrientThresholds>;
  /** Each name mapped to its verified record, with one database read (ADR-066). */
  matchFoods?(names: string[]): Promise<Map<string, FoodRecord>>;
}

/** The value at fraction `p` of sorted values (nearest rank). */
function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function computeThresholds(foods: FoodRecord[], p = 0.75): NutrientThresholds {
  const out: NutrientThresholds = {};
  for (const field of NUTRIENT_FIELDS) {
    const values = foods.map((f) => f.per100g[field]).filter((v): v is number => v !== null);
    const value = percentile(values, p);
    // A nutrient almost no food has (value 0 at the cut) cannot single anything out.
    if (value !== undefined && value > 0) out[field] = value;
  }
  return out;
}

export class NutritionService implements NutritionLookup {
  private index?: { value: AliasIndex; loadedAt: number };
  private thresholds?: { value: NutrientThresholds; loadedAt: number };

  constructor(
    private readonly repository: FoodRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async findFoodsInMessage(message: string): Promise<FoodRecord[]> {
    const index = await this.aliasIndex();
    const ids = findFoodMentions(message, index, MAX_FOODS_PER_MESSAGE);
    if (ids.length === 0) return [];
    const foods = await this.repository.getFoodsByIds(ids);
    // Keep the order foods were mentioned in.
    return ids.flatMap((id) => foods.find((f) => f.id === id) ?? []);
  }

  async findFoods(names: string[]): Promise<FoodRecord[]> {
    const index = await this.aliasIndex();
    const ids = [
      ...new Set(
        names.slice(0, MAX_FOODS_PER_OUTCOME).flatMap((n) => findFoodMentions(n, index, 1)),
      ),
    ];
    if (ids.length === 0) return [];
    const foods = await this.repository.getFoodsByIds(ids);
    return ids.flatMap((id) => foods.find((f) => f.id === id) ?? []);
  }

  async matchFoods(names: string[]): Promise<Map<string, FoodRecord>> {
    const index = await this.aliasIndex();
    const idByName = new Map<string, string>();
    for (const name of names) {
      const [id] = findFoodMentions(name, index, 1);
      if (id) idByName.set(name, id);
    }
    const out = new Map<string, FoodRecord>();
    if (idByName.size === 0) return out;
    const foods = await this.repository.getFoodsByIds([...new Set(idByName.values())]);
    for (const [name, id] of idByName) {
      const food = foods.find((f) => f.id === id);
      if (food) out.set(name, food);
    }
    return out;
  }

  async nutrientThresholds(): Promise<NutrientThresholds> {
    if (!this.thresholds || this.now() - this.thresholds.loadedAt > ALIAS_CACHE_MS) {
      this.thresholds = {
        value: computeThresholds(await this.repository.listFoods()),
        loadedAt: this.now(),
      };
    }
    return this.thresholds.value;
  }

  private async aliasIndex(): Promise<AliasIndex> {
    if (!this.index || this.now() - this.index.loadedAt > ALIAS_CACHE_MS) {
      this.index = {
        value: buildAliasIndex(await this.repository.listAliases()),
        loadedAt: this.now(),
      };
    }
    return this.index.value;
  }
}
