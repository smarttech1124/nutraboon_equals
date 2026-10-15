import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/db";
import type { PrismaClient } from "../lib/generated/prisma/client";
import { parsePriceSeed } from "../lib/budget/prices";
import type { Region } from "../lib/budget/regions";
import { parseSeedFile } from "../lib/nutrition/seed-data";

/**
 * Makes the Food and FoodAlias tables match prisma/seed/foods.json exactly.
 * Deterministic and safe to re-run (CLAUDE.md §26).
 */
export async function seedFoods(prisma: PrismaClient, seedPath = "prisma/seed/foods.json") {
  const { foods, aliases } = parseSeedFile(JSON.parse(readFileSync(seedPath, "utf8")));

  await prisma.$transaction(async (tx) => {
    await tx.foodAlias.deleteMany();
    await tx.food.deleteMany({ where: { id: { notIn: foods.map((f) => f.id) } } });

    for (const food of foods) {
      const data = {
        name: food.name,
        category: food.category,
        scientificName: food.scientificName,
        allergens: food.allergens,
        ...food.per100g,
        source: food.source,
        sourceUrl: food.sourceUrl,
        sourceVersion: food.sourceVersion,
        sourceFoodCode: food.sourceFoodCode,
        sourceFoodName: food.sourceFoodName,
        retrievedAt: new Date(`${food.retrievedAt}T00:00:00Z`),
        servingLabel: food.serving?.label ?? null,
        servingGrams: food.serving?.grams ?? null,
        servingSource: food.serving?.source ?? null,
        servingSourceUrl: food.serving?.sourceUrl ?? null,
        servingSourceVersion: food.serving?.sourceVersion ?? null,
        servingSourceRef: food.serving?.sourceRef ?? null,
      };
      await tx.food.upsert({
        where: { id: food.id },
        create: { id: food.id, ...data },
        update: data,
      });
    }

    await tx.foodAlias.createMany({ data: aliases });
  });

  return { foods: foods.length, aliases: aliases.length };
}

/**
 * Makes the price tables match prisma/seed/prices.json exactly: one estimate
 * per item and region for the file's month (ADR-036). Safe to re-run.
 */
export async function seedPrices(prisma: PrismaClient, seedPath = "prisma/seed/prices.json") {
  const { seed, aliases } = parsePriceSeed(JSON.parse(readFileSync(seedPath, "utf8")));
  const effectiveDate = new Date(`${seed.effectiveMonth}-01T00:00:00Z`);
  const retrievedAt = new Date(`${seed.retrievedAt}T00:00:00Z`);
  let estimates = 0;

  await prisma.$transaction(async (tx) => {
    await tx.priceItemAlias.deleteMany();
    await tx.priceEstimate.deleteMany();
    await tx.priceItem.deleteMany({ where: { id: { notIn: seed.items.map((i) => i.id) } } });

    for (const item of seed.items) {
      const data = {
        name: item.name,
        unitLabel: item.unitLabel,
        unitQuantity: item.unitQuantity,
        unitMeasure: item.unitMeasure,
        unitEvidence: item.unitEvidence,
        sourceItemLabel: item.nbsLabel,
      };
      await tx.priceItem.upsert({
        where: { id: item.id },
        create: { id: item.id, ...data },
        update: data,
      });
      const rows = Object.entries(item.estimates).map(([region, price]) => ({
        itemId: item.id,
        region: region as Region,
        price,
        currency: seed.currency,
        source: seed.source,
        sourceUrl: seed.sourceUrl,
        sourceVersion: seed.sourceVersion,
        effectiveDate,
        retrievedAt,
      }));
      await tx.priceEstimate.createMany({ data: rows });
      estimates += rows.length;
    }
    await tx.priceItemAlias.createMany({
      data: aliases.map((a) => ({ alias: a.alias, itemId: a.foodId })),
    });
  });

  return { items: seed.items.length, estimates, aliases: aliases.length };
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  // Prefer a direct connection, like migrations (see prisma.config.ts).
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to .env.local)");

  const prisma = createPrismaClient(url);
  try {
    const result = await seedFoods(prisma);
    console.log(`Seeded ${result.foods} foods and ${result.aliases} aliases.`);
    const prices = await seedPrices(prisma);
    console.log(
      `Seeded ${prices.items} price items, ${prices.estimates} estimates and ${prices.aliases} aliases.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
