import type { Food, PrismaClient } from "@/lib/generated/prisma/client";
import type { FoodRepository } from "./repository";
import { NUTRIENT_FIELDS, type AliasEntry, type FoodRecord, type NutrientValues } from "./types";

export function foodRowToRecord(row: Food): FoodRecord {
  const per100g = {} as NutrientValues;
  for (const field of NUTRIENT_FIELDS) per100g[field] = row[field];

  const hasServing =
    row.servingLabel && row.servingGrams && row.servingSource && row.servingSourceUrl;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    allergens: row.allergens,
    per100g,
    serving: hasServing
      ? {
          label: row.servingLabel!,
          grams: row.servingGrams!,
          source: row.servingSource!,
          sourceUrl: row.servingSourceUrl!,
        }
      : null,
    source: row.source,
    sourceUrl: row.sourceUrl,
    sourceVersion: row.sourceVersion,
    sourceFoodCode: row.sourceFoodCode,
    sourceFoodName: row.sourceFoodName,
  };
}

export class PrismaFoodRepository implements FoodRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAliases(): Promise<AliasEntry[]> {
    return this.prisma.foodAlias.findMany({ select: { alias: true, foodId: true } });
  }

  async getFoodsByIds(ids: string[]): Promise<FoodRecord[]> {
    const rows = await this.prisma.food.findMany({ where: { id: { in: ids } } });
    return rows.map(foodRowToRecord);
  }

  async listFoods(): Promise<FoodRecord[]> {
    return (await this.prisma.food.findMany()).map(foodRowToRecord);
  }
}
