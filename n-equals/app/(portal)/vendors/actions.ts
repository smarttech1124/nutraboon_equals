"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { productProblems } from "@/lib/vendors/product";
import { orgStatusFor } from "@/lib/vendors/server";

/**
 * Vendor and product review decisions (ADR-067), "vendors.verify" only. The
 * deterministic claim checks inform reviewers; only these decisions list or
 * delist anything.
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
  approve: { title: "Approved", body: "A reviewer approved it. See your vendor portal." },
  request_changes: {
    title: "Changes requested",
    body: "A reviewer asked for changes. Open your vendor portal to read their note.",
  },
  reject: {
    title: "Not approved",
    body: "A reviewer could not approve it. Open your vendor portal to read their note.",
  },
  suspend: {
    title: "Suspended",
    body: "It is hidden for now. Open your vendor portal to read the reviewer's note.",
  },
  reinstate: { title: "Reinstated", body: "It is active again. See your vendor portal." },
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function ownerIds(organizationId: string): Promise<string[]> {
  const owners = await getPrisma().membership.findMany({
    where: { organizationId, role: "owner" },
    select: { userId: true },
  });
  return owners.map((o) => o.userId);
}

export async function vendorReviewAction(
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
  return asAdmin("vendors.verify", `vendor_${decision}`, async (admin) => {
    const owners = await ownerIds(orgId);
    if (owners.includes(admin.id))
      return { status: "error", message: "You cannot review your own business." };
    const prisma = getPrisma();
    const { count } = await prisma.vendorProfile.updateMany({
      where: { organizationId: orgId, status: { in: rule.from } },
      data: {
        status: rule.to,
        reviewNote: note || null,
        ...(rule.to === "verified" ? { verifiedAt: new Date() } : {}),
      },
    });
    if (count === 0)
      return { status: "error", message: "The business's status changed. Reload and try again." };
    await prisma.organization.update({
      where: { id: orgId },
      data: { status: orgStatusFor(rule.to) },
    });
    await recordAudit({
      actorUserId: admin.id,
      action: `vendor.${decision}`,
      targetType: "vendor",
      targetId: orgId,
    });
    for (const userId of owners) {
      await notify(userId, {
        title: `Your business: ${MESSAGES[decision].title.toLowerCase()}`,
        body: MESSAGES[decision].body,
        link: "/vendor",
      });
    }
    revalidatePath("/vendors", "layout");
    return { status: "success", message: "Decision saved and the vendor was notified." };
  });
}

export async function productReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const productId = text(formData, "productId");
  const decision = text(formData, "decision") as Decision;
  const note = text(formData, "note").slice(0, 1000);
  const rule = RULES[decision];
  if (!productId || !rule) return FAILED;
  if (rule.needsNote && note.length < 5)
    return { status: "error", message: "Write a short note explaining why." };
  return asAdmin("vendors.verify", `product_${decision}`, async (admin) => {
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return FAILED;
    const owners = await ownerIds(product.organizationId);
    if (owners.includes(admin.id))
      return { status: "error", message: "You cannot review your own products." };
    // The code checks still apply: a product that breaks them cannot be approved.
    if (rule.to === "verified" && productProblems(product).length > 0) {
      return {
        status: "error",
        message: `This product cannot be approved: ${productProblems(product)[0]}`,
      };
    }
    const { count } = await prisma.product.updateMany({
      where: { id: productId, status: { in: rule.from } },
      data: {
        status: rule.to,
        reviewNote: note || null,
        ...(rule.to === "verified" ? { verifiedAt: new Date() } : {}),
      },
    });
    if (count === 0)
      return { status: "error", message: "The product's status changed. Reload and try again." };
    await recordAudit({
      actorUserId: admin.id,
      action: `product.${decision}`,
      targetType: "product",
      targetId: productId,
      metadata: { organizationId: product.organizationId },
    });
    for (const userId of owners) {
      await notify(userId, {
        title: `Your product: ${MESSAGES[decision].title.toLowerCase()}`,
        body: MESSAGES[decision].body,
        link: `/vendor/products/${productId}`,
      });
    }
    revalidatePath("/vendors", "layout");
    return { status: "success", message: "Decision saved and the vendor was notified." };
  });
}
