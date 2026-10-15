import type { Metadata } from "next";
import { PlanSection } from "@/components/account/plan-section";
import { requireVendor } from "@/lib/vendors/server";

export const metadata: Metadata = { title: "Plan — Vendor portal" };

/** The business's vendor plan: recommendations and how many products (ADR-062, ADR-067). */
export default async function VendorPlanPage() {
  const { user, org } = await requireVendor("/vendor/plan");
  return <PlanSection user={user} audience="vendor" organizationId={org.id} />;
}
