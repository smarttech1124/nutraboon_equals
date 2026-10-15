import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PlannerConversation } from "@/components/planner/conversation";
import { Button, Card } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { allowedDurations, describeFacts, parseFacts } from "@/lib/planner/facts";
import type { PlannerMessage } from "@/lib/planner/intake";
import { requirePlanner } from "@/lib/planner/server";
import { createPlanAction, deleteSessionAction, plannerTurnAction } from "../../actions";

export const metadata: Metadata = { title: "Plan with the Meal Planner" };
/** Creating a plan writes a week with several AI calls (ADR-066). */
export const maxDuration = 300;

export default async function SessionPage({ params }: PageProps<"/planner/session/[id]">) {
  const { id } = await params;
  const { user, entitlements } = await requirePlanner(`/planner/session/${id}`);
  const session = await getPrisma().plannerSession.findFirst({
    where: { id, userId: user.id },
    include: { plan: { select: { id: true } } },
  });
  if (!session) notFound();
  if (session.plan) redirect(`/planner/${session.plan.id}`);
  const facts = parseFacts(session.facts);
  const usage = await getEntitlementService().usage({ userId: user.id }, "mealPlans");
  const durations = allowedDurations(entitlements["mealPlanner.maxDays"]);
  const known = describeFacts(facts);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">Plan your meals</h1>
      <Card>
        <PlannerConversation
          initial={{
            status:
              session.status === "blocked"
                ? "blocked"
                : session.status === "ready"
                  ? "ready"
                  : "intake",
            messages: (session.messages as PlannerMessage[]) ?? [],
          }}
          turnAction={plannerTurnAction.bind(null, session.id)}
          createAction={createPlanAction.bind(null, session.id)}
          durations={durations}
          limitNote={`This uses 1 of your ${usage.limit} plans this month (${Math.max(0, usage.limit - usage.used)} left). Longer plans are written one week at a time.`}
        />
      </Card>
      {known.length > 0 && (
        <Card
          title="What the planner knows"
          description="From this conversation only. Deleting the conversation removes it."
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
            {known.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      )}
      <form action={deleteSessionAction.bind(null, session.id)}>
        <Button type="submit" variant="ghost">
          Delete this conversation
        </Button>
      </form>
    </div>
  );
}
