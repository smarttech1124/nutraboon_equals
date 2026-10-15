import type { Metadata } from "next";
import { requireNutritionist } from "@/lib/nutritionists/server";
import { PlanSection } from "@/components/account/plan-section";

export const metadata: Metadata = { title: "Plan — Nutritionist portal" };

/** The nutritionist's subscription and what it includes, e.g. a directory listing (ADR-062, ADR-064). */
export default async function PlanPage() {
  const { user } = await requireNutritionist("/nutritionist/plan");
  return <PlanSection user={user} audience="nutritionist" />;
}
