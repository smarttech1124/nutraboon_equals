import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Per-account activity for the n-equals Activity page (ADR-091). Counts and
 * dates only: never message text, meal-plan contents, notes or health
 * details. "Last active" is the latest of: a sign-in or session use (main
 * site or n-equals), a saved chat, Meal Planner use, a meal plan, a booking with a
 * nutritionist or hospital, and a hospital message thread. Chats that were
 * not saved to an account (guests, or past the plan's limit) are not linked
 * to anyone, so they are not counted here.
 */

export const ACTIVITY_WINDOWS = ["any", "1d", "7d", "30d", "inactive", "never"] as const;
export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

export const ACTIVITY_SORTS = ["last_active", "joined", "chats", "plans", "name"] as const;
export type ActivitySort = (typeof ACTIVITY_SORTS)[number];

export const ACCOUNT_KINDS = ["users", "admins", "all"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export type ActivityFilters = {
  q: string;
  status: "all" | "active" | "suspended";
  activity: ActivityWindow;
  kind: AccountKind;
  sort: ActivitySort;
  dir: "asc" | "desc";
};

export const WINDOW_LABEL: Record<ActivityWindow, string> = {
  any: "Any time",
  "1d": "Active in the last 24 hours",
  "7d": "Active in the last 7 days",
  "30d": "Active in the last 30 days",
  inactive: "Inactive for 30 days or more",
  never: "No activity recorded",
};

export const SORT_LABEL: Record<ActivitySort, string> = {
  last_active: "Last active",
  joined: "Joined",
  chats: "Saved chats",
  plans: "Meal plans",
  name: "Name",
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Reads the page's query string. Anything unexpected falls back to the default. */
export function parseActivityFilters(params: Record<string, unknown>): ActivityFilters {
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    status: pick(params.status, ["all", "active", "suspended"] as const, "all"),
    activity: pick(params.activity, ACTIVITY_WINDOWS, "any"),
    kind: pick(params.kind, ACCOUNT_KINDS, "users"),
    sort: pick(params.sort, ACTIVITY_SORTS, "last_active"),
    dir: pick(params.dir, ["asc", "desc"] as const, "desc"),
  };
}

export type ActivityRow = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  emailVerifiedAt: Date | null;
  createdAt: Date;
  isAdmin: boolean;
  chats: number;
  mealPlans: number;
  bookings: number;
  hospitalChats: number;
  plan: string | null;
  lastActive: Date | null;
};

export type ActivitySummary = {
  accounts: number;
  active1d: number;
  active7d: number;
  active30d: number;
  never: number;
};

/** Escapes LIKE wildcards so a search for "50%" means the characters. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Fixed SQL fragments, chosen from the parsed filters only (never from input).
const ORDER: Record<ActivitySort, string> = {
  last_active: `"lastActive"`,
  joined: `"createdAt"`,
  chats: `chats`,
  plans: `"mealPlans"`,
  name: `lower(name)`,
};

const WINDOW: Record<ActivityWindow, string> = {
  any: "TRUE",
  "1d": `"lastActive" >= now() - interval '1 day'`,
  "7d": `"lastActive" >= now() - interval '7 days'`,
  "30d": `"lastActive" >= now() - interval '30 days'`,
  inactive: `"lastActive" < now() - interval '30 days'`,
  never: `"lastActive" IS NULL`,
};

const KIND: Record<AccountKind, string> = {
  users: `NOT "isAdmin"`,
  admins: `"isAdmin"`,
  all: "TRUE",
};

/** One row per account with its activity, before the window filter. */
function base(filters: ActivityFilters): Prisma.Sql {
  const search = filters.q
    ? Prisma.sql`(u.email ILIKE ${likePattern(filters.q)} OR u.name ILIKE ${likePattern(filters.q)})`
    : Prisma.sql`TRUE`;
  const status =
    filters.status === "all" ? Prisma.sql`TRUE` : Prisma.sql`u.status::text = ${filters.status}`;
  return Prisma.sql`
    SELECT
      u.id, u.name, u.email, u.status::text AS status,
      u."emailVerifiedAt", u."createdAt",
      EXISTS (SELECT 1 FROM "AdminRoleAssignment" r WHERE r."userId" = u.id) AS "isAdmin",
      (SELECT count(*)::int FROM "Conversation" c WHERE c."userId" = u.id) AS chats,
      (SELECT count(*)::int FROM "MealPlan" m WHERE m."userId" = u.id) AS "mealPlans",
      ((SELECT count(*) FROM "Appointment" ap WHERE ap."clientId" = u.id)
        + (SELECT count(*) FROM "HospitalAppointment" h WHERE h."patientId" = u.id))::int AS bookings,
      (SELECT count(*)::int FROM "AccessConversation" ac WHERE ac."patientId" = u.id) AS "hospitalChats",
      (SELECT p.name FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
        WHERE s."userId" = u.id AND s.status::text IN ('active', 'past_due')
        ORDER BY s."createdAt" DESC LIMIT 1) AS plan,
      GREATEST(
        (SELECT max(GREATEST(se."lastSeenAt", se."createdAt")) FROM "Session" se WHERE se."userId" = u.id),
        (SELECT max(c."updatedAt") FROM "Conversation" c WHERE c."userId" = u.id),
        (SELECT max(ps."updatedAt") FROM "PlannerSession" ps WHERE ps."userId" = u.id),
        (SELECT max(m."updatedAt") FROM "MealPlan" m WHERE m."userId" = u.id),
        (SELECT max(ap."createdAt") FROM "Appointment" ap WHERE ap."clientId" = u.id),
        (SELECT max(h."createdAt") FROM "HospitalAppointment" h WHERE h."patientId" = u.id),
        (SELECT max(ac."updatedAt") FROM "AccessConversation" ac WHERE ac."patientId" = u.id)
      ) AS "lastActive"
    FROM "User" u
    WHERE ${search} AND ${status}`;
}

export async function activitySummary(
  prisma: PrismaClient,
  filters: ActivityFilters,
): Promise<ActivitySummary> {
  const [row] = await prisma.$queryRaw<ActivitySummary[]>`
    WITH a AS (${base({ ...filters, q: "", status: "all" })})
    SELECT
      count(*)::int AS accounts,
      (count(*) FILTER (WHERE ${Prisma.raw(WINDOW["1d"])}))::int AS "active1d",
      (count(*) FILTER (WHERE ${Prisma.raw(WINDOW["7d"])}))::int AS "active7d",
      (count(*) FILTER (WHERE ${Prisma.raw(WINDOW["30d"])}))::int AS "active30d",
      (count(*) FILTER (WHERE ${Prisma.raw(WINDOW.never)}))::int AS never
    FROM a WHERE ${Prisma.raw(KIND[filters.kind])}`;
  return row ?? { accounts: 0, active1d: 0, active7d: 0, active30d: 0, never: 0 };
}

export async function countActivity(
  prisma: PrismaClient,
  filters: ActivityFilters,
): Promise<number> {
  const [row] = await prisma.$queryRaw<{ total: number }[]>`
    WITH a AS (${base(filters)})
    SELECT count(*)::int AS total FROM a
    WHERE ${Prisma.raw(KIND[filters.kind])} AND ${Prisma.raw(WINDOW[filters.activity])}`;
  return row?.total ?? 0;
}

export function listActivity(
  prisma: PrismaClient,
  filters: ActivityFilters,
  page: { skip: number; take: number },
): Promise<ActivityRow[]> {
  const direction = filters.dir === "asc" ? "ASC" : "DESC";
  return prisma.$queryRaw<ActivityRow[]>`
    WITH a AS (${base(filters)})
    SELECT * FROM a
    WHERE ${Prisma.raw(KIND[filters.kind])} AND ${Prisma.raw(WINDOW[filters.activity])}
    ORDER BY ${Prisma.raw(`${ORDER[filters.sort]} ${direction} NULLS LAST`)}, id
    LIMIT ${page.take} OFFSET ${page.skip}`;
}
