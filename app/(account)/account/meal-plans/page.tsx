import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlannerHome } from "@/components/planner/planner-home";
import { Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";

export const metadata: Metadata = { title: "Meal plans" };

/** Meal plans in the account dashboard (ADR-075): the same planner home as /planner. */
export default async function AccountMealPlans() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account/meal-plans");
  const service = getEntitlementService();
  const enabled = await service.isEnabled("mealPlanner");
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-ink">Meal plans</h1>
      {enabled ? (
        <PlannerHome
          user={user}
          entitlements={await service.entitlementsFor({ userId: user.id })}
        />
      ) : (
        <Card title="Coming soon">
          <p className="text-sm text-muted">
            The Meal Planner is not available yet. You can still{" "}
            <Link href="/" className="font-semibold text-brand-text underline">
              ask the assistant
            </Link>{" "}
            to plan a meal.
          </p>
        </Card>
      )}
    </>
  );
}
