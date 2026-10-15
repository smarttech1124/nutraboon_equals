import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { seedDemo } from "@/lib/demo/seed";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The demo seed against a real, isolated PostgreSQL database (ADR-074).
 * Runs with `npm run test:db`.
 */
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = !!url && /test/i.test(new URL(url).pathname);

describe.skipIf(!isTestDatabase)("demo seed (PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = createPrismaClient(url!);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { startsWith: "demo-" } } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: "demo-", endsWith: "@example.test" } },
    });
    await prisma.$disconnect();
  });

  const counts = async () => ({
    nutritionists: await prisma.nutritionistProfile.count({
      where: { user: { email: { startsWith: "demo-" } } },
    }),
    vendors: await prisma.vendorProfile.count({
      where: { organizationId: { startsWith: "demo-" } },
    }),
    products: await prisma.product.count({ where: { id: { startsWith: "demo-" } } }),
    hospitals: await prisma.hospitalProfile.count({
      where: { organizationId: { startsWith: "demo-" } },
    }),
    subscriptions: await prisma.subscription.count({ where: { id: { startsWith: "demo-" } } }),
    plans: await prisma.plan.count({
      where: { code: { in: ["plus-monthly", "family-monthly", "premium-yearly"] } },
    }),
    qualifications: await prisma.qualification.count({
      where: { profile: { user: { email: { startsWith: "demo-" } } } },
    }),
  });

  it("creates the demo records, and a second run creates no duplicates", async () => {
    const first = await seedDemo(prisma);
    expect(first.nutritionists).toBe(5);
    const after1 = await counts();
    expect(after1.nutritionists).toBe(5);
    expect(after1.vendors).toBe(5);
    expect(after1.hospitals).toBe(5);
    expect(after1.plans).toBe(3);
    expect(after1.products).toBe(10);

    const second = await seedDemo(prisma);
    expect(second.plans).toBe(0);
    expect(await counts()).toEqual(after1);
  });

  it("never overwrites a plan an administrator already made", async () => {
    await prisma.plan.update({
      where: { code: "plus-monthly" },
      data: { name: "Plus (edited by admin)" },
    });
    await seedDemo(prisma);
    expect((await prisma.plan.findUnique({ where: { code: "plus-monthly" } }))?.name).toBe(
      "Plus (edited by admin)",
    );
  });

  it("leaves the demo accounts unable to sign in without a password", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "demo-nutritionist-amaka@example.test" },
    });
    expect(user?.passwordHash).toBe("!no-password");
  });
});
