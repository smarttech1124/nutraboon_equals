import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaFoodRepository } from "@/lib/nutrition/prisma-repository";
import { NutritionService } from "@/lib/nutrition/service";
import { PrismaPriceRepository } from "@/lib/budget/prisma-repository";
import { PrismaConversationStore } from "@/lib/conversation/prisma-store";
import { hashClientKey, PostgresRateLimiter } from "@/lib/http/postgres-rate-limit";
import { CONVERSATION_TTL_MS } from "@/lib/conversation/store";
import { seedFoods, seedPrices } from "@/prisma/seed";
import { estimate, prices } from "../helpers/seed-prices";
import { seed } from "../helpers/seed-foods";

/**
 * Runs against a real, isolated PostgreSQL database (CLAUDE.md §26).
 * Set DATABASE_URL_TEST to a database whose name contains "test"; the suite
 * applies migrations and replaces all food rows in it.
 */
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = !!url && /test/i.test(new URL(url).pathname);

describe.skipIf(!isTestDatabase)("food database (PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = createPrismaClient(url!);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("seeds every food and alias, and re-seeding is idempotent", async () => {
    const first = await seedFoods(prisma);
    const second = await seedFoods(prisma);

    expect(first).toEqual({ foods: seed.foods.length, aliases: seed.aliases.length });
    expect(second).toEqual(first);
    expect(await prisma.food.count()).toBe(seed.foods.length);
    expect(await prisma.foodAlias.count()).toBe(seed.aliases.length);
  }, 60_000);

  it("stores values and provenance exactly as in the seed file", async () => {
    const orange = await prisma.food.findUniqueOrThrow({ where: { id: "orange" } });
    const expected = seed.foods.find((f) => f.id === "orange")!;

    expect(orange.energyKcal).toBe(expected.per100g.energyKcal);
    expect(orange.vitaminCMg).toBe(expected.per100g.vitaminCMg);
    expect(orange.sourceFoodCode).toBe(expected.sourceFoodCode);
    expect(orange.servingGrams).toBe(expected.serving!.grams);
    expect(orange.retrievedAt.toISOString().slice(0, 10)).toBe(expected.retrievedAt);
  });

  it("looks up foods from a message through the Prisma repository", async () => {
    const service = new NutritionService(new PrismaFoodRepository(prisma));
    const foods = await service.findFoodsInMessage("Compare garri and Papaya with egusi");

    expect(foods.map((f) => f.id)).toEqual(["gari", "pawpaw", "egusi"]);
    expect(foods[1].serving?.source).toContain("USDA");
    expect(foods[0].serving).toBeNull();
  });

  it("seeds price estimates idempotently and reads them back per region", async () => {
    const first = await seedPrices(prisma);
    expect(await seedPrices(prisma)).toEqual(first);
    expect(first.items).toBe(prices.seed.items.length);
    expect(first.estimates).toBe(prices.seed.items.length * 7);

    const repo = new PrismaPriceRepository(prisma);
    const sw = await repo.listPricedItems("south_west");
    expect(sw.find((i) => i.id === "garri-white-1kg")?.price).toBe(
      estimate("garri-white-1kg", "south_west"),
    );
    expect(sw.every((i) => i.effectiveMonth === prices.seed.effectiveMonth)).toBe(true);
  }, 60_000);

  it("stores conversations in Postgres, shared and expiring", async () => {
    const id = `test-${Date.now()}`;
    const writer = new PrismaConversationStore(prisma);
    await writer.save({
      id,
      messages: [{ role: "user", content: "My son is allergic to peanuts." }],
      currentIntent: "meal_planning",
      allergies: ["peanut"],
      profile: { householdSize: 3, state: "Lagos" },
      updatedAt: 0,
    });

    // A second store object stands in for another server instance.
    const reader = new PrismaConversationStore(prisma);
    expect(await reader.get(id)).toMatchObject({
      allergies: ["peanut"],
      profile: { householdSize: 3, state: "Lagos" },
    });

    const later = new PrismaConversationStore(prisma, () => Date.now() + CONVERSATION_TTL_MS + 1);
    expect(await later.get(id)).toBeUndefined();
    await later.cleanupExpired();
    expect(await prisma.conversation.findUnique({ where: { id } })).toBeNull();
  });

  it("counts rate limits exactly across instances under concurrency", async () => {
    const ip = `test-${Date.now()}`;
    const a = new PostgresRateLimiter(prisma, 20, 60_000, "test-secret");
    const b = new PostgresRateLimiter(prisma, 20, 60_000, "test-secret");
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).check(ip)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    expect(await prisma.rateLimit.findMany({ where: { key: ip } })).toEqual([]);
    await prisma.rateLimit.delete({ where: { key: hashClientKey(ip, "test-secret") } });
  });
});

describe.runIf(!isTestDatabase)("food database (PostgreSQL)", () => {
  it.skip("skipped: set DATABASE_URL_TEST to a database named *test* to run these tests", () => {});
});
