/**
 * Loads the demonstration data (ADR-074): 5 nutritionists, 5 vendors with 10
 * products, 5 hospitals with departments, and 6 plans (3 for people, one per
 * partner audience). Safe to re-run: records are updated, never duplicated.
 *
 *   npm run db:seed:demo                        demo data only
 *   npm run db:seed:demo -- --enable-features   also switch on Nutritionists, Vendors,
 *                                               Hospitals and the Meal Planner
 *   DEMO_PASSWORD=… npm run db:seed:demo        let the demo accounts sign in with it
 *
 * Refuses to run when NODE_ENV is "production", or when APP_URL is not a
 * localhost address, unless --allow-production is passed on purpose.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { PrismaBillingRepository } from "../lib/billing/repository";
import { SETTING_KEYS, parseFeatureFlags } from "../lib/billing/settings";
import { PASSWORD_MIN } from "../lib/auth/service";
import { createPrismaClient } from "../lib/db";
import { seedDemo } from "../lib/demo/seed";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const env = { ...local, ...process.env };
  const url = env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (e.g. in .env.local) first.");

  const appUrl = env.APP_URL || "http://localhost:3000";
  const looksLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(appUrl);
  if ((env.NODE_ENV === "production" || !looksLocal) && !args.has("--allow-production")) {
    throw new Error(
      "This looks like a production environment. Demo data is for development and demos; pass --allow-production only if you really mean it.",
    );
  }
  const password = env.DEMO_PASSWORD;
  if (password !== undefined && password.length < PASSWORD_MIN) {
    throw new Error(`DEMO_PASSWORD must be at least ${PASSWORD_MIN} characters.`);
  }

  const prisma = createPrismaClient(url);
  try {
    const result = await seedDemo(prisma, { password });
    console.log("Demo data:", result);
    if (args.has("--enable-features")) {
      const repo = new PrismaBillingRepository(prisma);
      const flags = parseFeatureFlags(await repo.getSetting(SETTING_KEYS.features));
      await repo.setSetting(
        SETTING_KEYS.features,
        { ...flags, nutritionists: true, vendors: true, hospitals: true, mealPlanner: true },
        null,
      );
      console.log("Switched on: Nutritionists, Vendors, Hospitals, Meal Planner.");
    }
    console.log(
      password
        ? "Demo accounts (demo-*@example.test) can sign in with DEMO_PASSWORD."
        : "Demo accounts cannot sign in (no DEMO_PASSWORD given).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
