import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Platform figures for the n-equals overview (ADR-080). Counts only: no
 * names, emails or message text. "Active users" are accounts with a main-site
 * session used in the window (sessions record when they were last used);
 * chats are counted from stored conversations, which expire, so long windows
 * undercount once conversations are cleaned up.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days in the daily charts. */
export const TREND_DAYS = 14;

export type DailyPoint = { day: string; count: number };

export type UserAnalytics = {
  platformUsers: number;
  admins: number;
  suspended: number;
  newUsers7d: number;
  newUsers30d: number;
  activeUsers1d: number;
  activeUsers7d: number;
  activeUsers30d: number;
  signupsDaily: DailyPoint[];
};

export type ActivityAnalytics = {
  chats1d: number;
  chats7d: number;
  chatsDaily: DailyPoint[];
  mealPlans30d: number;
  nutritionistSessionsUpcoming: number;
  hospitalAppointmentsUpcoming: number;
  productImpressions30d: number;
  productClicks30d: number;
};

export type QueueAnalytics = {
  nutritionists: number;
  vendors: number;
  products: number;
  hospitals: number;
};

export type SubscriptionAnalytics = {
  active: number;
  pastDue: number;
  /** Sum of monthly-equivalent plan prices of active subscriptions, per currency, in minor units. */
  monthlyRevenueMinor: Record<string, number>;
};

/** The last TREND_DAYS calendar days in Lagos, oldest first, as YYYY-MM-DD. */
export function trendDays(now: Date, days = TREND_DAYS): string[] {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" });
  return Array.from({ length: days }, (_, i) =>
    format.format(new Date(now.getTime() - (days - 1 - i) * DAY_MS)),
  );
}

/** Fills missing days with 0 so every chart has one bar per day. */
export function fillDays(rows: { day: string; count: number }[], days: string[]): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return days.map((day) => ({ day, count: byDay.get(day) ?? 0 }));
}

/** Monthly equivalent of a plan price: yearly plans count as one twelfth. */
export function monthlyMinor(priceMinor: number, interval: string): number {
  return interval === "yearly" ? Math.round(priceMinor / 12) : priceMinor;
}

const since = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

async function daily(
  prisma: PrismaClient,
  table: "User" | "Conversation",
  from: Date,
  days: string[],
): Promise<DailyPoint[]> {
  // The table name is one of two literals; values are parameters.
  const rows =
    table === "User"
      ? await prisma.$queryRaw<{ day: string; count: bigint }[]>`
          SELECT to_char("createdAt" AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
                 COUNT(*) AS count
          FROM "User"
          WHERE "createdAt" >= ${from}
            AND NOT EXISTS (SELECT 1 FROM "AdminRoleAssignment" a WHERE a."userId" = "User"."id")
          GROUP BY day`
      : await prisma.$queryRaw<{ day: string; count: bigint }[]>`
          SELECT to_char("createdAt" AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
                 COUNT(*) AS count
          FROM "Conversation"
          WHERE "createdAt" >= ${from}
          GROUP BY day`;
  return fillDays(
    rows.map((r) => ({ day: r.day, count: Number(r.count) })),
    days,
  );
}

async function activeUsers(prisma: PrismaClient, from: Date): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "userId") AS count
    FROM "Session"
    WHERE "app" = 'web' AND "lastSeenAt" >= ${from}`;
  return Number(row?.count ?? 0);
}

export async function userAnalytics(
  prisma: PrismaClient,
  now = new Date(),
): Promise<UserAnalytics> {
  const days = trendDays(now);
  const platform = { adminRoles: { none: {} } };
  const [
    platformUsers,
    admins,
    suspended,
    newUsers7d,
    newUsers30d,
    activeUsers1d,
    activeUsers7d,
    activeUsers30d,
    signupsDaily,
  ] = await Promise.all([
    prisma.user.count({ where: platform }),
    prisma.user.count({ where: { adminRoles: { some: {} } } }),
    prisma.user.count({ where: { ...platform, status: "suspended" } }),
    prisma.user.count({ where: { ...platform, createdAt: { gte: since(now, 7) } } }),
    prisma.user.count({ where: { ...platform, createdAt: { gte: since(now, 30) } } }),
    activeUsers(prisma, since(now, 1)),
    activeUsers(prisma, since(now, 7)),
    activeUsers(prisma, since(now, 30)),
    daily(prisma, "User", since(now, TREND_DAYS), days),
  ]);
  return {
    platformUsers,
    admins,
    suspended,
    newUsers7d,
    newUsers30d,
    activeUsers1d,
    activeUsers7d,
    activeUsers30d,
    signupsDaily,
  };
}

export async function activityAnalytics(
  prisma: PrismaClient,
  now = new Date(),
): Promise<ActivityAnalytics> {
  const days = trendDays(now);
  const day30 = new Date(since(now, 30).toISOString().slice(0, 10));
  const [
    chats1d,
    chats7d,
    chatsDaily,
    mealPlans30d,
    nutritionistSessionsUpcoming,
    hospitalAppointmentsUpcoming,
    products,
  ] = await Promise.all([
    prisma.conversation.count({ where: { createdAt: { gte: since(now, 1) } } }),
    prisma.conversation.count({ where: { createdAt: { gte: since(now, 7) } } }),
    daily(prisma, "Conversation", since(now, TREND_DAYS), days),
    prisma.mealPlan.count({ where: { createdAt: { gte: since(now, 30) } } }),
    prisma.appointment.count({
      where: { startsAt: { gte: now }, status: { in: ["requested", "accepted"] } },
    }),
    prisma.hospitalAppointment.count({ where: { startsAt: { gte: now }, status: "booked" } }),
    prisma.productStat.aggregate({
      where: { day: { gte: day30 } },
      _sum: { impressions: true, clicks: true },
    }),
  ]);
  return {
    chats1d,
    chats7d,
    chatsDaily,
    mealPlans30d,
    nutritionistSessionsUpcoming,
    hospitalAppointmentsUpcoming,
    productImpressions30d: products._sum.impressions ?? 0,
    productClicks30d: products._sum.clicks ?? 0,
  };
}

export async function subscriptionAnalytics(prisma: PrismaClient): Promise<SubscriptionAnalytics> {
  const [active, pastDue] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "active", provider: { not: "manual" } },
      select: { plan: { select: { priceMinor: true, interval: true, currency: true } } },
    }),
    prisma.subscription.count({ where: { status: "past_due" } }),
  ]);
  const monthlyRevenueMinor: Record<string, number> = {};
  for (const { plan } of active) {
    monthlyRevenueMinor[plan.currency] =
      (monthlyRevenueMinor[plan.currency] ?? 0) + monthlyMinor(plan.priceMinor, plan.interval);
  }
  const allActive = await prisma.subscription.count({ where: { status: "active" } });
  return { active: allActive, pastDue, monthlyRevenueMinor };
}

export async function queueAnalytics(prisma: PrismaClient): Promise<QueueAnalytics> {
  const [nutritionists, vendors, products, hospitals] = await Promise.all([
    prisma.nutritionistProfile.count({ where: { status: "submitted" } }),
    prisma.vendorProfile.count({ where: { status: "submitted" } }),
    prisma.product.count({ where: { status: "submitted" } }),
    prisma.hospitalProfile.count({ where: { status: "submitted" } }),
  ]);
  return { nutritionists, vendors, products, hospitals };
}
