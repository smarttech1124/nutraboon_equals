import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanSection } from "@/components/account/plan-section";
import { currentUser } from "@/lib/auth/next";

export const metadata: Metadata = { title: "Change plan" };

/** Your plan and the plans you can move to (ADR-062, ADR-063, ADR-075). */
export default async function AccountPlan() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account/plan");
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-ink">Change plan</h1>
      <PlanSection user={user} />
    </>
  );
}
