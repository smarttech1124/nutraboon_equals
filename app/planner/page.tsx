import type { Metadata } from "next";
import { connection } from "next/server";
import { ComingSoon } from "@/components/site/coming-soon";
import { CheckList } from "@/components/site/marketing";
import { PlannerHome } from "@/components/planner/planner-home";
import { ButtonLink } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Meal Planner",
  description:
    "Personal meal plans for Nigerian households: recipes, portions, nutrition and a priced shopping list, planned around your budget and allergies.",
};

/**
 * The Meal Planner (ADR-066, ADR-075). Anyone can read what it does; creating
 * and managing plans needs an account. Signing in returns here (`next`).
 */
export default async function PlannerPage() {
  await connection();
  const service = getEntitlementService();
  if (!(await service.isEnabled("mealPlanner"))) {
    return (
      <ComingSoon
        icon="calendar"
        title="Meal Planner"
        text="Personal meal plans with recipes, portions and shopping lists are on their way. Until then, the assistant can plan tonight's meal for you."
      />
    );
  }
  const user = await currentUser("web");
  const entitlements = user ? await service.entitlementsFor({ userId: user.id }) : null;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="planner-title" className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col items-start gap-4">
          <p className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold tracking-[0.12em] text-gold-text uppercase">
            Meal Planner
          </p>
          <h1 id="planner-title" className="font-display text-4xl font-bold text-ink sm:text-5xl">
            Plan your meals around your life
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            Tell the planner who you cook for, what you want to achieve and what you can spend. It
            asks one question at a time, then writes a plan with recipes, portions, nutrition from
            trusted food data, and a priced shopping list.
          </p>
          {!user && (
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up?next=/planner" size="lg">
                Create my meal plan
              </ButtonLink>
              <ButtonLink href="/sign-in?next=/planner" variant="secondary" size="lg">
                Log in to see your plans
              </ButtonLink>
            </div>
          )}
          {!user && (
            <p className="text-sm text-muted">
              A free account keeps your plans private to you. You&apos;ll come back here after
              signing up.
            </p>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="font-display text-xl font-semibold text-ink">Why plan ahead</h2>
          <div className="mt-4">
            <CheckList
              items={[
                "Spend less: one shopping list for the week, priced from market estimates.",
                "Eat better: balanced meals with nutrition worked out from real food data.",
                "Safer for your family: allergies, pregnancy and young children are taken into account.",
                "Less stress: recipes and portions for everyone you cook for.",
              ]}
            />
          </div>
        </div>
      </section>
      {user && entitlements && <PlannerHome user={user} entitlements={entitlements} />}
    </div>
  );
}
