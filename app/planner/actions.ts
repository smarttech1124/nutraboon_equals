"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { allowedDurations, OBJECTIVES, parseFacts } from "@/lib/planner/facts";
import { PlannerGenerationError, replaceMeal } from "@/lib/planner/generate";
import {
  intakeTurn,
  MAX_MESSAGE_CHARS,
  OPENING_MESSAGE,
  type PlannerMessage,
} from "@/lib/planner/intake";
import { parseDays } from "@/lib/planner/schema";
import {
  GENERATION_MESSAGES,
  plannerProvider,
  saveWeek,
  weekCount,
  writeWeek,
} from "@/lib/planner/server";

/** Meal Planner actions (ADR-066). Each acts on the signed-in user's own sessions and plans. */

export type TurnState = {
  status: "intake" | "ready" | "blocked" | "error";
  messages: PlannerMessage[];
  urgentNotice?: string;
  error?: string;
};

export type PlanActionState = { status: "idle" | "success" | "error"; message: string };

const UNAVAILABLE = "The Meal Planner is not available right now. Please try again later.";
const TOO_MANY = "You have made a lot of requests. Please wait a while and try again.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function messagesOf(value: unknown): PlannerMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is PlannerMessage =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
}

async function plannerUser() {
  const user = await currentUser("web");
  if (!user) return null;
  return (await getEntitlementService().isEnabled("mealPlanner")) ? user : null;
}

function logError(action: string, error: unknown) {
  console.error(
    JSON.stringify({
      event: "planner_error",
      action,
      error: error instanceof Error ? error.name : "unknown",
      ...(error instanceof PlannerGenerationError ? { reason: error.reason } : {}),
    }),
  );
}

export async function startSessionAction(): Promise<void> {
  const user = await plannerUser();
  if (!user) redirect("/sign-in?next=/planner");
  const session = await getPrisma().plannerSession.create({
    data: {
      userId: user.id,
      messages: [{ role: "assistant", content: OPENING_MESSAGE }],
    },
  });
  redirect(`/planner/session/${session.id}`);
}

export async function plannerTurnAction(
  sessionId: string,
  prev: TurnState,
  formData: FormData,
): Promise<TurnState> {
  const user = await plannerUser();
  if (!user) return { ...prev, status: "error", error: UNAVAILABLE };
  const text = field(formData, "message").slice(0, MAX_MESSAGE_CHARS);
  if (!text) return { ...prev, error: "Type a message first." };
  if (!(await allowAttempt("planner", "web"))) return { ...prev, error: TOO_MANY };
  const prisma = getPrisma();
  const session = await prisma.plannerSession.findFirst({
    where: { id: sessionId, userId: user.id, status: { in: ["intake", "ready"] } },
  });
  if (!session) return { ...prev, status: "error", error: "This planning conversation has ended." };
  const provider = await plannerProvider();
  if (!provider) return { ...prev, error: UNAVAILABLE };
  try {
    const entitlements = await getEntitlementService().entitlementsFor({ userId: user.id });
    const result = await intakeTurn(
      {
        facts: parseFacts(session.facts),
        messages: messagesOf(session.messages),
        userMessage: text,
      },
      provider,
      { customObjectives: entitlements["mealPlanner.customObjectives"] },
    );
    await prisma.plannerSession.update({
      where: { id: session.id },
      data: {
        facts: result.facts as Prisma.InputJsonValue,
        messages: result.messages as unknown as Prisma.InputJsonValue,
        status: result.status,
      },
    });
    revalidatePath(`/planner/session/${session.id}`);
    return {
      status: result.status,
      messages: result.messages,
      ...(result.urgentNotice ? { urgentNotice: result.urgentNotice } : {}),
    };
  } catch (error) {
    logError("turn", error);
    return {
      ...prev,
      error: "I'm having trouble connecting right now. Please try again in a moment.",
    };
  }
}

export async function createPlanAction(
  sessionId: string,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const user = await plannerUser();
  if (!user) return { status: "error", message: UNAVAILABLE };
  if (!(await allowAttempt("planner", "web"))) return { status: "error", message: TOO_MANY };
  const prisma = getPrisma();
  const session = await prisma.plannerSession.findFirst({
    where: { id: sessionId, userId: user.id, status: "ready" },
  });
  if (!session) return { status: "error", message: "Finish the conversation first." };
  const service = getEntitlementService();
  const entitlements = await service.entitlementsFor({ userId: user.id });
  const duration = Number(field(formData, "durationDays"));
  if (!allowedDurations(entitlements["mealPlanner.maxDays"]).some((d) => d.days === duration)) {
    return { status: "error", message: "Choose one of the plan lengths shown." };
  }
  const provider = await plannerProvider();
  if (!provider) return { status: "error", message: UNAVAILABLE };
  const usage = await service.consume({ userId: user.id }, "mealPlans");
  if (!usage.ok) {
    return {
      status: "error",
      message: `You have used all ${usage.limit} meal plans for this month. A plan with more is available on the Plans page.`,
    };
  }
  const facts = parseFacts(session.facts);
  let planId: string | undefined;
  try {
    const plan = await prisma.mealPlan.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        title: facts.objective ? OBJECTIVES[facts.objective] : "Meal plan",
        objective: facts.objective ?? "healthy",
        facts: facts as Prisma.InputJsonValue,
        durationDays: duration,
        startDate: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    planId = plan.id;
    await writeWeek(plan.id, 0, provider, {
      withShopping: entitlements["mealPlanner.shoppingList"],
    });
    await prisma.plannerSession.update({ where: { id: session.id }, data: { status: "done" } });
    await recordAudit({
      actorUserId: user.id,
      action: "meal_plan.created",
      targetType: "meal_plan",
      targetId: plan.id,
      metadata: { durationDays: duration },
    });
  } catch (error) {
    logError("create", error);
    if (planId) await prisma.mealPlan.delete({ where: { id: planId } }).catch(() => {});
    await service.refund({ userId: user.id }, "mealPlans").catch(() => {});
    return {
      status: "error",
      message:
        GENERATION_MESSAGES[error instanceof PlannerGenerationError ? error.reason : "invalid"],
    };
  }
  redirect(`/planner/${planId}`);
}

async function ownedPlan(userId: string, planId: string) {
  return getPrisma().mealPlan.findFirst({
    where: { id: planId, userId },
    include: { weeks: { select: { weekIndex: true, adjustments: true } } },
  });
}

/** Generates the next week of a plan, in order. */
export async function nextWeekAction(planId: string): Promise<PlanActionState> {
  const user = await plannerUser();
  if (!user) return { status: "error", message: UNAVAILABLE };
  if (!(await allowAttempt("planner", "web"))) return { status: "error", message: TOO_MANY };
  const plan = await ownedPlan(user.id, planId);
  if (!plan) return { status: "error", message: "That plan was not found." };
  const next = plan.weeks.length;
  if (next >= weekCount(plan.durationDays)) {
    return { status: "error", message: "Every week of this plan is ready." };
  }
  const provider = await plannerProvider();
  if (!provider) return { status: "error", message: UNAVAILABLE };
  try {
    const entitlements = await getEntitlementService().entitlementsFor({ userId: user.id });
    await writeWeek(plan.id, next, provider, {
      withShopping: entitlements["mealPlanner.shoppingList"],
    });
  } catch (error) {
    logError("next_week", error);
    return {
      status: "error",
      message:
        GENERATION_MESSAGES[error instanceof PlannerGenerationError ? error.reason : "invalid"],
    };
  }
  revalidatePath(`/planner/${plan.id}`);
  return { status: "success", message: `Week ${next + 1} is ready.` };
}

async function adjustmentAllowed(userId: string, used: number) {
  const entitlements = await getEntitlementService().entitlementsFor({ userId });
  return {
    allowed: used < entitlements["mealPlanner.adjustmentsPerWeek"],
    limit: entitlements["mealPlanner.adjustmentsPerWeek"],
    withShopping: entitlements["mealPlanner.shoppingList"],
  };
}

/** Rewrites a week with the user's feedback ("less rice, more fish"). */
export async function adjustWeekAction(
  planId: string,
  weekIndex: number,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const user = await plannerUser();
  if (!user) return { status: "error", message: UNAVAILABLE };
  const feedback = field(formData, "feedback").slice(0, 400);
  if (feedback.length < 3) return { status: "error", message: "Say what you would like changed." };
  if (!(await allowAttempt("planner", "web"))) return { status: "error", message: TOO_MANY };
  const plan = await ownedPlan(user.id, planId);
  const week = plan?.weeks.find((w) => w.weekIndex === weekIndex);
  if (!plan || !week) return { status: "error", message: "That week was not found." };
  const rule = await adjustmentAllowed(user.id, week.adjustments);
  if (!rule.allowed) {
    return {
      status: "error",
      message: `You have used the ${rule.limit} adjustment${rule.limit === 1 ? "" : "s"} for this week.`,
    };
  }
  const provider = await plannerProvider();
  if (!provider) return { status: "error", message: UNAVAILABLE };
  try {
    await writeWeek(plan.id, weekIndex, provider, {
      withShopping: rule.withShopping,
      feedback,
      countAdjustment: true,
    });
  } catch (error) {
    logError("adjust_week", error);
    return {
      status: "error",
      message:
        GENERATION_MESSAGES[error instanceof PlannerGenerationError ? error.reason : "invalid"],
    };
  }
  revalidatePath(`/planner/${plan.id}`);
  return { status: "success", message: "Week updated." };
}

/** Replaces one meal, keeping the rest of the day. */
export async function replaceMealAction(
  planId: string,
  weekIndex: number,
  dayIndex: number,
  mealIndex: number,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const user = await plannerUser();
  if (!user) return { status: "error", message: UNAVAILABLE };
  if (!(await allowAttempt("planner", "web"))) return { status: "error", message: TOO_MANY };
  const prisma = getPrisma();
  const plan = await prisma.mealPlan.findFirst({ where: { id: planId, userId: user.id } });
  const week = plan
    ? await prisma.mealPlanWeek.findUnique({ where: { planId_weekIndex: { planId, weekIndex } } })
    : null;
  if (!plan || !week) return { status: "error", message: "That meal was not found." };
  const days = parseDays(week.days);
  const day = days[dayIndex];
  if (!day?.meals[mealIndex]) return { status: "error", message: "That meal was not found." };
  const rule = await adjustmentAllowed(user.id, week.adjustments);
  if (!rule.allowed) {
    return { status: "error", message: `You have used the adjustments for this week.` };
  }
  const provider = await plannerProvider();
  if (!provider) return { status: "error", message: UNAVAILABLE };
  try {
    const facts = parseFacts(plan.facts);
    const newDay = await replaceMeal(
      provider,
      facts,
      day,
      mealIndex,
      field(formData, "reason").slice(0, 200),
    );
    const nextDays = days.map((d, i) => (i === dayIndex ? newDay : d));
    await saveWeek(plan.id, weekIndex, nextDays, facts, provider.name, {
      withShopping: rule.withShopping,
      countAdjustment: true,
    });
  } catch (error) {
    logError("replace_meal", error);
    return {
      status: "error",
      message:
        GENERATION_MESSAGES[error instanceof PlannerGenerationError ? error.reason : "invalid"],
    };
  }
  revalidatePath(`/planner/${plan.id}`);
  return { status: "success", message: "Meal replaced." };
}

export async function deletePlanAction(planId: string): Promise<void> {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/planner");
  const prisma = getPrisma();
  const plan = await prisma.mealPlan.findFirst({ where: { id: planId, userId: user.id } });
  if (plan) {
    // The intake conversation holds the same personal facts; it goes too.
    await prisma.$transaction([
      prisma.mealPlan.delete({ where: { id: plan.id } }),
      ...(plan.sessionId
        ? [prisma.plannerSession.deleteMany({ where: { id: plan.sessionId } })]
        : []),
    ]);
  }
  redirect("/planner");
}

export async function deleteSessionAction(sessionId: string): Promise<void> {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/planner");
  await getPrisma().plannerSession.deleteMany({ where: { id: sessionId, userId: user.id } });
  redirect("/planner");
}
