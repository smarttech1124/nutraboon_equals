import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DailyBars, Stat } from "@admin/components/analytics";
import { PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import {
  activityAnalytics,
  queueAnalytics,
  subscriptionAnalytics,
  userAnalytics,
} from "@admin/lib/analytics";
import { Badge, Card } from "@/components/ui";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/claude";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { PROVIDERS } from "@/lib/ai/settings/providers";
import { getAISettings, getXeelaa } from "@/lib/ai/settings/runtime";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";

export const metadata: Metadata = { title: "Overview" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );

type ActiveAI = {
  name: string;
  detail: string;
  xeelaa?: "On" | "Off" | "Not set up" | "Key not working";
  failing: number;
  saved: number;
};

async function activeAI(): Promise<ActiveAI> {
  const envProvider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const fallback: ActiveAI = {
    name:
      envProvider === "mock"
        ? "Demo mode (no AI)"
        : envProvider === "claude"
          ? `Anthropic Claude · ${process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL}`
          : `Google Gemini · ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`,
    detail: "From the server environment settings",
    failing: 0,
    saved: 0,
  };
  const settings = getAISettings();
  const xeelaa = getXeelaa();
  if (!settings.ok || !xeelaa.ok) return fallback;
  try {
    const [configs, view] = await Promise.all([settings.service.list(), xeelaa.service.view()]);
    const live = configs.filter((c) => c.status !== "revoked");
    const active = configs.find((c) => c.isActive);
    const xeelaaState = view.active
      ? "On"
      : view.enabled && view.status === "invalid"
        ? "Key not working"
        : view.configured
          ? "Off"
          : "Not set up";
    return {
      ...(active
        ? {
            name: `${PROVIDERS[active.provider].label} · ${active.model}`,
            detail: `Key ${active.keyHint}${active.verifiedAt ? `, last checked ${dateFormat.format(active.verifiedAt)}` : ""}`,
          }
        : { name: fallback.name, detail: fallback.detail }),
      xeelaa: xeelaaState,
      failing: live.filter((c) => c.status === "failed").length,
      saved: live.length,
    };
  } catch {
    return fallback;
  }
}

/**
 * Platform analytics (ADR-080): active AI, active and new users, chats,
 * subscriptions, review queues and engagement. Each section shows only what
 * the administrator's role may see.
 */
export default async function OverviewPage() {
  await connection();
  const access = await adminAccess();
  if (!access.ok) return null;
  const roles = access.user.adminRoles;
  const prisma = getPrisma();
  const seeUsers = can(roles, "users.read");
  const seeAI = can(roles, "ai.manage");
  const seeSubs = can(roles, "subscriptions.read");
  const queues = {
    nutritionists: can(roles, "nutritionists.verify"),
    vendors: can(roles, "vendors.verify"),
    hospitals: can(roles, "hospitals.verify"),
  };
  const seeQueues = queues.nutritionists || queues.vendors || queues.hospitals;

  const [users, activity, subs, queue, ai] = await Promise.all([
    seeUsers ? userAnalytics(prisma) : null,
    seeUsers ? activityAnalytics(prisma) : null,
    seeSubs ? subscriptionAnalytics(prisma) : null,
    seeQueues ? queueAnalytics(prisma) : null,
    seeAI ? activeAI() : null,
  ]);
  const revenue = subs
    ? Object.entries(subs.monthlyRevenueMinor)
        .map(([currency, minor]) => money(minor, currency))
        .join(" + ") || money(0, "NGN")
    : "";
  const ctr =
    activity && activity.productImpressions30d > 0
      ? `${((activity.productClicks30d / activity.productImpressions30d) * 100).toFixed(1)}% click rate`
      : "No impressions yet";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        description={`Signed in as ${access.user.email}. Figures are live; times are Lagos time.`}
      />

      {ai && (
        <Card
          title="Active AI"
          actions={
            <Link href="/ai" className="text-sm text-brand-text underline underline-offset-2">
              Manage
            </Link>
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-ink">{ai.name}</p>
              <p className="text-sm text-muted">{ai.detail}</p>
            </div>
            <dl className="flex flex-wrap gap-6 text-sm">
              <div>
                <dt className="text-muted">XEELAA</dt>
                <dd>
                  <Badge
                    tone={
                      ai.xeelaa === "On"
                        ? "success"
                        : ai.xeelaa === "Key not working"
                          ? "error"
                          : "neutral"
                    }
                  >
                    {ai.xeelaa ?? "Not set up"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Saved keys</dt>
                <dd className="font-semibold text-ink">{ai.saved}</dd>
              </div>
              <div>
                <dt className="text-muted">Failing checks</dt>
                <dd>
                  {ai.failing > 0 ? (
                    <Badge tone="error">{ai.failing} failing</Badge>
                  ) : (
                    <Badge tone="success">None</Badge>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      )}

      {users && activity && (
        <section aria-labelledby="people" className="flex flex-col gap-4">
          <h2 id="people" className="text-lg font-semibold text-ink">
            People and activity
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              title="Active users today"
              value={users.activeUsers1d}
              detail={`${users.activeUsers7d} this week · ${users.activeUsers30d} in 30 days`}
            />
            <Stat
              title="Platform users"
              value={users.platformUsers}
              detail={`${users.newUsers7d} new this week · ${users.suspended} suspended`}
            />
            <Stat
              title="Chats started today"
              value={activity.chats1d}
              detail={`${activity.chats7d} in 7 days, with or without an account`}
            />
            <Stat
              title="Meal plans created"
              value={activity.mealPlans30d}
              detail="In the last 30 days"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DailyBars title="New platform users per day" points={users.signupsDaily} />
            <DailyBars title="Chats started per day" points={activity.chatsDaily} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              title="Upcoming nutritionist sessions"
              value={activity.nutritionistSessionsUpcoming}
              detail="Requested or accepted"
            />
            <Stat
              title="Upcoming hospital appointments"
              value={activity.hospitalAppointmentsUpcoming}
            />
            <Stat
              title="Product impressions"
              value={activity.productImpressions30d}
              detail={`${activity.productClicks30d} clicks · ${ctr} (30 days)`}
            />
            <Stat
              title="Administrators"
              value={users.admins}
              detail={
                <Link href="/admins" className="text-brand-text underline">
                  Manage
                </Link>
              }
            />
          </div>
        </section>
      )}

      {(subs || queue) && (
        <section aria-labelledby="business" className="flex flex-col gap-4">
          <h2 id="business" className="text-lg font-semibold text-ink">
            Subscriptions and reviews
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {subs && (
              <>
                <Stat
                  title="Active subscriptions"
                  value={subs.active}
                  detail={`${subs.pastDue} with payment due`}
                />
                <Stat
                  title="Monthly recurring revenue"
                  value={revenue}
                  detail="Paid plans, yearly counted as a twelfth"
                />
              </>
            )}
            {queue && (
              <Stat
                title="Waiting for review"
                value={
                  (queues.nutritionists ? queue.nutritionists : 0) +
                  (queues.vendors ? queue.vendors + queue.products : 0) +
                  (queues.hospitals ? queue.hospitals : 0)
                }
                detail={[
                  queues.nutritionists && `${queue.nutritionists} nutritionists`,
                  queues.vendors && `${queue.vendors} vendors, ${queue.products} products`,
                  queues.hospitals && `${queue.hospitals} hospitals`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
