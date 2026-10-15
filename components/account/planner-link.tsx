import Link from "next/link";
import { Card } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";

/** Entry point to the Meal Planner from the account page, when it is switched on (ADR-066). */
export async function PlannerLink() {
  if (!(await getEntitlementService().isEnabled("mealPlanner"))) return null;
  return (
    <Card
      title="Meal Planner"
      description="Answer a few questions and get a plan with recipes, portions, nutrition and shopping."
    >
      <Link
        href="/planner"
        className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
      >
        Open the Meal Planner
      </Link>
    </Card>
  );
}
