import type { Prisma } from "@/lib/generated/prisma/client";
import { redirect } from "next/navigation";
import { getStructuredProvider } from "@/lib/ai/settings/runtime";
import type { AIProvider } from "@/lib/ai/types";
import { currentUser } from "@/lib/auth/next";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { analyseQualifications, PROMPT_VERSION } from "./analysis";

/** Server helpers for the nutritionist portal and reviews (ADR-064). */

export type PortalAccess = { user: AuthUser; status: string };

/** For portal pages: signed in, feature on, and a profile started. */
export async function requireNutritionist(path: string): Promise<PortalAccess> {
  const user = await currentUser("web");
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  if (!(await getEntitlementService().isEnabled("nutritionists"))) redirect("/account");
  const profile = await getPrisma().nutritionistProfile.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });
  if (!profile) redirect("/nutritionist/join");
  return { user, status: profile.status };
}

export type PortalActionState = { status: "idle" | "success" | "error"; message: string };

export const PORTAL_SIGNED_OUT: PortalActionState = {
  status: "error",
  message: "Please sign in again.",
};
export const PORTAL_FAILED: PortalActionState = {
  status: "error",
  message: "Something went wrong. Nothing was changed; please try again.",
};

/** Runs a portal action for the signed-in nutritionist, mapping failures to safe messages. */
export async function asNutritionist(
  action: string,
  run: (user: AuthUser, profile: { status: string }) => Promise<PortalActionState>,
): Promise<PortalActionState> {
  const user = await currentUser("web");
  if (!user) return PORTAL_SIGNED_OUT;
  try {
    if (!(await getEntitlementService().isEnabled("nutritionists"))) {
      return { status: "error", message: "The nutritionist portal is not available right now." };
    }
    const profile = await getPrisma().nutritionistProfile.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (!profile) return { status: "error", message: "Start your nutritionist profile first." };
    if (profile.status === "suspended" || profile.status === "rejected") {
      return { status: "error", message: "Your profile cannot be changed at the moment." };
    }
    return await run(user, profile);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "nutritionist_action_error",
        action,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return PORTAL_FAILED;
  }
}

/**
 * A verified profile goes back to review when what was verified changes
 * (title, specialisations, experience, qualifications or documents). It is
 * not listed again until a reviewer approves it.
 */
export function reviewUpdate(status: string): Prisma.NutritionistProfileUpdateInput {
  return status === "verified" ? { status: "submitted", submittedAt: new Date() } : {};
}

/** Runs and stores a qualification analysis. Never throws for AI problems. */
export async function runQualificationAnalysis(userId: string): Promise<void> {
  const prisma = getPrisma();
  const profile = await prisma.nutritionistProfile.findUnique({
    where: { userId },
    include: { qualifications: true, _count: { select: { documents: true } } },
  });
  if (!profile) return;
  let provider: AIProvider | null = null;
  try {
    provider = await getStructuredProvider();
  } catch {
    provider = null;
  }
  const result = await analyseQualifications(
    {
      title: profile.title,
      specializations: profile.specializations,
      expertise: profile.expertise,
      yearsExperience: profile.yearsExperience,
      qualifications: profile.qualifications.map((q) => ({
        kind: q.kind,
        title: q.title,
        institution: q.institution,
        year: q.year,
        hasRegistrationNumber: Boolean(q.registrationNumber),
        expiresOn: q.expiresOn,
      })),
      documentCount: profile._count.documents,
    },
    provider,
  );
  await prisma.qualificationAnalysis.create({
    data: {
      profileId: userId,
      status: result.status,
      provider: result.provider,
      promptVersion: PROMPT_VERSION,
      checks: result.checks,
      ...(result.assessment ? { assessment: result.assessment } : {}),
    },
  });
}
