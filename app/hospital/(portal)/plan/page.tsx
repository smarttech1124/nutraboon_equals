import type { Metadata } from "next";
import { PlanSection } from "@/components/account/plan-section";
import { requireHospital } from "@/lib/hospitals/server";

export const metadata: Metadata = { title: "Plan — Hospital portal" };

/** The hospital's plan: listing and how many staff accounts (ADR-068). */
export default async function HospitalPlanPage() {
  const { user, org } = await requireHospital("/hospital/plan", true);
  return <PlanSection user={user} audience="hospital" organizationId={org.id} />;
}
