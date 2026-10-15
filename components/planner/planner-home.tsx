import Link from "next/link";
import { startSessionAction } from "@/app/planner/actions";
import { Button, Card } from "@/components/ui";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import type { Entitlements } from "@/lib/billing/entitlements";
import { getPrisma } from "@/lib/db";
import { allowedDurations } from "@/lib/planner/facts";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/**
 * The signed-in person's Meal Planner: start a plan, continue a conversation,
 * open saved plans (ADR-066, ADR-075). Used by /planner and the account
 * dashboard. Only this user's plans are read; the plan pages and actions
 * check ownership again on the server.
 */
export async function PlannerHome({
  user,
  entitlements,
  headingLevel = 2,
}: {
  user: AuthUser;
  entitlements: Entitlements;
  headingLevel?: 2 | 3;
}) {
  const prisma = getPrisma();
  const [plans, sessions, usage] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, durationDays: true, createdAt: true },
    }),
    prisma.plannerSession.findMany({
      where: { userId: user.id, status: { in: ["intake", "ready"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, updatedAt: true, status: true },
    }),
    getEntitlementService().usage({ userId: user.id }, "mealPlans"),
  ]);
  const longest = allowedDurations(entitlements["mealPlanner.maxDays"]).at(-1)?.label ?? "1 day";
  const left = Math.max(0, usage.limit - usage.used);
  const H = headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="create-plan-title"
        className="flex flex-col gap-4 rounded-3xl bg-brand p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div>
          <H id="create-plan-title" className="font-display text-2xl font-bold">
            Create a new meal plan
          </H>
          <p className="mt-1 opacity-90">
            {left > 0
              ? `You can create ${left} more plan${left === 1 ? "" : "s"} this month, each up to ${longest} long.`
              : "You have used this month's plans. They renew at the start of next month."}
          </p>
        </div>
        {left > 0 ? (
          <form action={startSessionAction}>
            <Button
              type="submit"
              className="min-h-12 bg-gold px-6 text-base text-[#264653] hover:bg-gold hover:brightness-95"
            >
              Create my meal plan
            </Button>
          </form>
        ) : (
          <Link
            href="/account/plan"
            className="inline-flex min-h-12 items-center rounded-full bg-gold px-6 font-semibold text-[#264653]"
          >
            See plans with more
          </Link>
        )}
      </section>

      {sessions.length > 0 && (
        <Card title="Continue planning">
          <ul className="flex flex-col gap-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/planner/session/${s.id}`}
                  className="font-semibold text-brand-text underline"
                >
                  Planning conversation from {dateFormat.format(s.updatedAt)}
                </Link>
                {s.status === "ready" && <span className="text-muted"> · ready to create</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Your meal plans">
        {plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center">
            <p className="font-medium text-ink">You haven&apos;t created a meal plan yet</p>
            <p className="mt-1 text-sm text-muted">
              Select &quot;Create my meal plan&quot;. The planner asks who you are cooking for, your
              budget and any allergies, one question at a time, then writes your plan.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/planner/${p.id}`} className="font-semibold text-brand-text underline">
                  {p.title}
                </Link>
                <span className="text-muted">
                  {p.durationDays} day{p.durationDays === 1 ? "" : "s"} · created{" "}
                  {dateFormat.format(p.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
