"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";

/**
 * Gives a verified partner a year of public listing (ADR-082): a manual,
 * non-renewing grant of the cheapest active partner plan that includes the
 * listing entitlement. Needs "subscriptions.manage".
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS = {
  hospital: { key: "hospital.listing", path: "/hospitals" },
  vendor: { key: "vendor.listing", path: "/vendors" },
  nutritionist: { key: "nutritionist.listing", path: "/nutritionists" },
} as const;
type Kind = keyof typeof KINDS;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function grantListingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const kind = field(formData, "kind") as Kind;
  const holderId = field(formData, "holderId");
  if (!(kind in KINDS) || !holderId) return FAILED;
  return asAdmin("subscriptions.manage", "listing_grant", async (admin) => {
    const prisma = getPrisma();
    const plan = await prisma.plan.findFirst({
      where: {
        audience: kind,
        active: true,
        entitlements: { path: [KINDS[kind].key], equals: true },
      },
      orderBy: { priceMinor: "asc" },
      select: { id: true, name: true },
    });
    if (!plan) {
      return {
        status: "error",
        message:
          "No active plan for this kind of partner includes listing. Create one under Plans, or include listing in the free tier under Settings.",
      };
    }
    const now = new Date();
    const sub = await prisma.subscription.create({
      data: {
        planId: plan.id,
        ...(kind === "nutritionist" ? { userId: holderId } : { organizationId: holderId }),
        status: "active",
        provider: "manual",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * DAY_MS),
        cancelAtPeriodEnd: true,
      },
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "subscription.granted",
      targetType: "subscription",
      targetId: sub.id,
      metadata: { planId: plan.id, kind, holderId, days: 365, reason: "listing" },
    });
    revalidatePath(`${KINDS[kind].path}/${holderId}`);
    return { status: "success", message: `${plan.name} granted for a year. The listing is live.` };
  });
}
