import { readFileSync } from "node:fs";
import { InMemoryFoodRepository } from "@/lib/nutrition/repository";
import { parseSeedFile, seedFoodToRecord } from "@/lib/nutrition/seed-data";

/** The real seed file, so tests exercise the same data the database holds. */
export const seedJson = JSON.parse(readFileSync("prisma/seed/foods.json", "utf8"));
export const seed = parseSeedFile(seedJson);
export const seedRecords = seed.foods.map(seedFoodToRecord);

export function seedRepository() {
  return new InMemoryFoodRepository(seedRecords, seed.aliases);
}

export function seedFood(id: string) {
  const food = seedRecords.find((f) => f.id === id);
  if (!food) throw new Error(`No seed food "${id}"`);
  return food;
}
