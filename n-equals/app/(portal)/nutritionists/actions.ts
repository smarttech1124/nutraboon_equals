"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { runQualificationAnalysis } from "@/lib/nutritionists/server";

/**
 * Nutritionist verification decisions (ADR-064), "nutritionists.verify" only.
 * The AI analysis informs reviewers; only these decisions change a status.
 */

type Decision = "approve" | "request_changes" | "reject" | "suspend" | "reinstate";

const RULES: Record<
  Decision,
  { from: string[]; to: string; needsNote: boolean; title: string; body: string }
> = {
  approve: {
    from: ["submitted"],
    to: "verified",
    needsNote: false,
    title: "Your nutritionist profile is verified",
    body: "Your profile was approved. See your portal for what happens next.",
  },
  request_changes: {
    from: ["submitted", "verified"],
    to: "changes_requested",
    needsNote: true,
    title: "Changes requested on your nutritionist profile",
    body: "A reviewer asked for changes. Open your portal to read their note, then submit again.",
  },
  reject: {
    from: ["submitted", "changes_requested"],
    to: "rejected",
    needsNote: true,
    title: "Your nutritionist profile was not approved",
    body: "A reviewer could not approve your profile. Open your portal to read their note.",
  },
  suspend: {
    from: ["verified", "submitted", "changes_requested"],
    to: "suspended",
    needsNote: true,
    title: "Your nutritionist profile is suspended",
    body: "Your profile is hidden for now. Open your portal to read the reviewer's note.",
  },
  reinstate: {
    from: ["suspended", "rejected"],
    to: "verified",
    needsNote: false,
    title: "Your nutritionist profile is active again",
    body: "Your profile was reinstated. See your portal for details.",
  },
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function reviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = text(formData, "userId");
  const decision = text(formData, "decision") as Decision;
  const note = text(formData, "note").slice(0, 1000);
  const rule = RULES[decision];
  if (!userId || !rule) return FAILED;
  if (rule.needsNote && note.length < 5) {
    return { status: "error", message: "Write a short note for the nutritionist explaining why." };
  }
  return asAdmin("nutritionists.verify", `nutritionist_${decision}`, async (admin) => {
    if (userId === admin.id) {
      return { status: "error", message: "You cannot review your own profile." };
    }
    const now = new Date();
    const { count } = await getPrisma().nutritionistProfile.updateMany({
      where: {
        userId,
        status: {
          in: rule.from as (
            "submitted" | "verified" | "changes_requested" | "suspended" | "rejected"
          )[],
        },
      },
      data: {
        status: rule.to as "verified" | "changes_requested" | "rejected" | "suspended",
        reviewNote: note || null,
        ...(rule.to === "verified" ? { verifiedAt: now } : {}),
      },
    });
    if (count === 0) {
      return { status: "error", message: "The profile's status changed. Reload and try again." };
    }
    await recordAudit({
      actorUserId: admin.id,
      action: `nutritionist.${decision}`,
      targetType: "nutritionist",
      targetId: userId,
    });
    await notify(userId, { title: rule.title, body: rule.body, link: "/nutritionist" });
    revalidatePath("/nutritionists", "layout");
    return { status: "success", message: "Decision saved and the nutritionist was notified." };
  });
}

export async function rerunAnalysisAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = text(formData, "userId");
  if (!userId) return FAILED;
  return asAdmin("nutritionists.verify", "nutritionist_analysis", async (admin) => {
    await runQualificationAnalysis(userId);
    await recordAudit({
      actorUserId: admin.id,
      action: "nutritionist.analysis_run",
      targetType: "nutritionist",
      targetId: userId,
    });
    revalidatePath(`/nutritionists/${userId}`);
    return { status: "success", message: "Analysis updated." };
  });
}
