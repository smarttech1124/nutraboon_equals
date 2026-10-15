import type { SafetyContext } from "@/lib/conversation/profile";
import { conditionLabel } from "./context";

/**
 * Professional-care referrals written by the app (CLAUDE.md §6–7, ADR-041).
 * Each sensitive situation gets one referral, the first time it appears.
 */
export function sensitiveCategories(context: SafetyContext): string[] {
  const categories: string[] = [];
  if (context.pregnant) categories.push("pregnancy");
  if (context.breastfeeding) categories.push("breastfeeding");
  if (context.infant || context.childUnder5) categories.push("child");
  for (const c of context.conditions ?? []) categories.push(`condition:${c}`);
  if (context.takesMedication) categories.push("medication");
  return categories;
}

export function referralNotice(categories: string[]): string | undefined {
  const parts: string[] = [];
  if (categories.includes("pregnancy")) {
    parts.push(
      "For advice about your pregnancy, talk to your antenatal clinic, midwife or doctor.",
    );
  }
  if (categories.includes("breastfeeding")) {
    parts.push("While breastfeeding, your midwife, doctor or child welfare clinic can advise you.");
  }
  if (categories.includes("child")) {
    parts.push(
      "For your child's growth and feeding, a child welfare clinic, primary health centre or paediatrician can advise you.",
    );
  }
  const conditions = categories
    .filter((c) => c.startsWith("condition:"))
    .map((c) => conditionLabel(c.slice("condition:".length)));
  if (conditions.length > 0) {
    parts.push(
      `Your doctor or a registered dietitian can tailor food advice for ${conditions.join(" and ")}.`,
    );
  }
  if (categories.includes("medication")) {
    parts.push(
      "Keep taking any medicine as prescribed, and ask your doctor or pharmacist before changing it.",
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
