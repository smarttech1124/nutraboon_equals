"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { activateHospitalStaff } from "@/lib/hospitals/staff";
import { orgStatusFor } from "@/lib/vendors/server";

/**
 * Hospital review decisions (ADR-068), "hospitals.verify" only. Only verified
 * hospitals appear to patients.
 */

type Decision = "approve" | "request_changes" | "reject" | "suspend" | "reinstate";
type Status = "draft" | "submitted" | "changes_requested" | "verified" | "rejected" | "suspended";

const RULES: Record<Decision, { from: Status[]; to: Status; needsNote: boolean }> = {
  approve: { from: ["submitted"], to: "verified", needsNote: false },
  request_changes: { from: ["submitted", "verified"], to: "changes_requested", needsNote: true },
  reject: { from: ["submitted", "changes_requested"], to: "rejected", needsNote: true },
  suspend: {
    from: ["verified", "submitted", "changes_requested"],
    to: "suspended",
    needsNote: true,
  },
  reinstate: { from: ["suspended", "rejected"], to: "verified", needsNote: false },
};

const MESSAGES: Record<Decision, { title: string; body: string }> = {
  approve: {
    title: "Your hospital is verified",
    body: "Patients can now find your hospital, book appointments and message your staff.",
  },
  request_changes: {
    title: "Changes requested for your hospital",
    body: "A reviewer asked for changes. Open the hospital portal to read their note.",
  },
  reject: {
    title: "Your hospital was not approved",
    body: "Open the hospital portal to read the reviewer's note.",
  },
  suspend: {
    title: "Your hospital is suspended",
    body: "It is hidden from patients for now. Open the hospital portal to read the note.",
  },
  reinstate: {
    title: "Your hospital is reinstated",
    body: "Patients can find your hospital again.",
  },
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function hospitalReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orgId = text(formData, "orgId");
  const decision = text(formData, "decision") as Decision;
  const note = text(formData, "note").slice(0, 1000);
  const rule = RULES[decision];
  if (!orgId || !rule) return FAILED;
  if (rule.needsNote && note.length < 5)
    return { status: "error", message: "Write a short note explaining why." };
  return asAdmin("hospitals.verify", `hospital_${decision}`, async (admin) => {
    const prisma = getPrisma();
    const managers = await prisma.membership.findMany({
      where: { organizationId: orgId, role: { in: ["owner", "admin"] } },
      select: { userId: true },
    });
    if (managers.some((m) => m.userId === admin.id))
      return { status: "error", message: "You cannot review your own hospital." };
    const { count } = await prisma.hospitalProfile.updateMany({
      where: { organizationId: orgId, status: { in: rule.from } },
      data: {
        status: rule.to,
        reviewNote: note || null,
        ...(rule.to === "verified" ? { verifiedAt: new Date() } : {}),
      },
    });
    if (count === 0)
      return { status: "error", message: "The hospital's status changed. Reload and try again." };
    await prisma.organization.update({
      where: { id: orgId },
      data: { status: orgStatusFor(rule.to) },
    });
    await recordAudit({
      actorUserId: admin.id,
      action: `hospital.${decision}`,
      targetType: "hospital",
      targetId: orgId,
    });
    for (const m of managers) {
      await notify(m.userId, { ...MESSAGES[decision], link: "/hospital" });
    }
    // Staff added while the hospital waited are activated and told now (ADR-089).
    const activated = rule.to === "verified" ? await activateHospitalStaff(orgId) : 0;
    revalidatePath("/hospitals", "layout");
    return {
      status: "success",
      message: activated
        ? `Decision saved and the hospital was notified. ${activated} staff account${activated === 1 ? " is" : "s are"} now active.`
        : "Decision saved and the hospital was notified.",
    };
  });
}
