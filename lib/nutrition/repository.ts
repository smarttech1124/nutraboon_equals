import type { AliasEntry, FoodRecord } from "./types";

export interface FoodRepository {
  listAliases(): Promise<AliasEntry[]>;
  getFoodsByIds(ids: string[]): Promise<FoodRecord[]>;
  /** Every food; used to rank nutrient content within the dataset. */
  listFoods(): Promise<FoodRecord[]>;
}

/** Repository over an in-memory list; used by tests and as a reference implementation. */
export class InMemoryFoodRepository implements FoodRepository {
  private readonly foods: Map<string, FoodRecord>;

  constructor(
    foods: FoodRecord[],
    private readonly aliases: AliasEntry[],
  ) {
    this.foods = new Map(foods.map((f) => [f.id, f]));
  }

  async listAliases(): Promise<AliasEntry[]> {
    return this.aliases;
  }

  async getFoodsByIds(ids: string[]): Promise<FoodRecord[]> {
    return ids.flatMap((id) => this.foods.get(id) ?? []);
  }

  async listFoods(): Promise<FoodRecord[]> {
    return [...this.foods.values()];
  }
}
