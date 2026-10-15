import type { Prisma } from "@/lib/generated/prisma/client";
import { redirect } from "next/navigation";
import { getStructuredProvider } from "@/lib/ai/settings/runtime";
import type { AIProvider } from "@/lib/ai/types";
import { currentUser } from "@/lib/auth/next";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import type { Entitlements } from "@/lib/billing/entitlements";
import { PrismaPriceRepository } from "@/lib/budget/prisma-repository";
import { zoneOfState } from "@/lib/budget/regions";
import { PriceService } from "@/lib/budget/service";
import { getPrisma } from "@/lib/db";
import { PrismaFoodRepository } from "@/lib/nutrition/prisma-repository";
import { NutritionService } from "@/lib/nutrition/service";
import { parseFacts, type PlannerFacts } from "./facts";
import { generateDays, PROMPT_VERSION } from "./generate";
import { dayNutrition, ingredientNames } from "./nutrition";
import { parseDays, type PlannerDay } from "./schema";
import { buildShoppingList } from "./shopping";

/** Server helpers for the Meal Planner pages and actions (ADR-066). */

export const DAYS_PER_WEEK = 7;

export type PlannerAccess = { user: AuthUser; entitlements: Entitlements };

/** For planner pages: signed in and the Meal Planner switched on. */
export async function requirePlanner(path: string): Promise<PlannerAccess> {
  const user = await currentUser("web");
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const service = getEntitlementService();
  if (!(await service.isEnabled("mealPlanner"))) redirect("/planner");
  return { user, entitlements: await service.entitlementsFor({ userId: user.id }) };
}

const shared = globalThis as unknown as {
  plannerNutrition?: NutritionService;
  plannerPrices?: PriceService;
};

function nutritionService() {
  shared.plannerNutrition ??= new NutritionService(new PrismaFoodRepository(getPrisma()));
  return shared.plannerNutrition;
}

function priceService() {
  shared.plannerPrices ??= new PriceService(new PrismaPriceRepository(getPrisma()));
  return shared.plannerPrices;
}

export async function plannerProvider(): Promise<AIProvider | null> {
  try {
    const provider = await getStructuredProvider();
    return provider.generateJson ? provider : null;
  } catch {
    return null;
  }
}

export function weekCount(durationDays: number): number {
  return Math.ceil(durationDays / DAYS_PER_WEEK);
}

export function daysInWeek(durationDays: number, weekIndex: number): number {
  return Math.max(0, Math.min(DAYS_PER_WEEK, durationDays - weekIndex * DAYS_PER_WEEK));
}

/** Nutrition per day and (when included) a costed shopping list; both by code. */
async function extras(days: PlannerDay[], facts: PlannerFacts, withShopping: boolean) {
  let nutrition: Prisma.InputJsonValue | undefined;
  try {
    const foods = await nutritionService().matchFoods(ingredientNames(days));
    const people = Math.max(1, facts.members?.length ?? 1);
    nutrition = days.map((d) => dayNutrition(d, foods, people));
  } catch {
    nutrition = undefined;
  }
  let shopping: Prisma.InputJsonValue | undefined;
  if (withShopping) {
    let book = null;
    try {
      book = await priceService().priceBook(zoneOfState(facts.state ?? undefined) ?? "national");
    } catch {
      book = null;
    }
    shopping = buildShoppingList(days, book) as unknown as Prisma.InputJsonValue;
  }
  return { nutrition, shopping };
}

/**
 * Generates (or regenerates) one week of a plan and stores it. Throws
 * PlannerGenerationError when the AI fails or produces something unsafe.
 */
export async function writeWeek(
  planId: string,
  weekIndex: number,
  provider: AIProvider,
  options: { withShopping: boolean; feedback?: string; countAdjustment?: boolean },
): Promise<void> {
  const prisma = getPrisma();
  const plan = await prisma.mealPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      weeks: { where: { weekIndex: { lt: weekIndex } }, orderBy: { weekIndex: "desc" }, take: 2 },
    },
  });
  const facts = parseFacts(plan.facts);
  const previousMeals = plan.weeks.flatMap((w) =>
    parseDays(w.days).flatMap((d) => d.meals.map((m) => m.name)),
  );
  const dayCount = daysInWeek(plan.durationDays, weekIndex);
  const days = await generateDays(
    provider,
    facts,
    weekIndex * DAYS_PER_WEEK + 1,
    dayCount,
    previousMeals,
    options.feedback,
  );
  await saveWeek(planId, weekIndex, days, facts, provider.name, options);
}

/** Stores a week's days with fresh nutrition and shopping. */
export async function saveWeek(
  planId: string,
  weekIndex: number,
  days: PlannerDay[],
  facts: PlannerFacts,
  providerName: string,
  options: { withShopping: boolean; countAdjustment?: boolean },
): Promise<void> {
  const { nutrition, shopping } = await extras(days, facts, options.withShopping);
  const data = {
    days: days as unknown as Prisma.InputJsonValue,
    nutrition,
    shopping,
    provider: providerName,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date(),
  };
  await getPrisma().mealPlanWeek.upsert({
    where: { planId_weekIndex: { planId, weekIndex } },
    create: { planId, weekIndex, ...data },
    update: { ...data, ...(options.countAdjustment ? { adjustments: { increment: 1 } } : {}) },
  });
}

export const GENERATION_MESSAGES: Record<string, string> = {
  unavailable: "The planner could not reach the AI service. Please try again in a moment.",
  invalid: "The planner could not put this plan together. Please try again.",
  unsafe:
    "The planner could not make a plan that safely meets everything you told us. Try changing your answers, or ask a nutritionist.",
};
