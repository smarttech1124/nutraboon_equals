"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { planHolderOrgId } from "@/lib/vendors/ownership";

/**
 * Subscription administration (ADR-062, ADR-063). Manual grants give a plan
 * without payment, for a set number of days (support cases, partners, tests).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function grantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email").toLowerCase();
  const planId = text(formData, "planId");
  const days = Number(text(formData, "days"));
  if (!email || !planId) return { status: "error", message: "Enter an email and choose a plan." };
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    return { status: "error", message: "Days must be a whole number from 1 to 366." };
  }
  return asAdmin("subscriptions.manage", "subscription_grant", async (admin) => {
    const prisma = getPrisma();
    const [user, plan] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.plan.findUnique({ where: { id: planId }, select: { id: true, audience: true } }),
    ]);
    if (!user) return { status: "error", message: "No account uses that email." };
    if (!plan) return { status: "error", message: "Choose a plan." };
    // Vendor and hospital plans go to the organisation the account owns (ADR-067, ADR-068).
    const orgId = await planHolderOrgId(user.id, plan.audience);
    if (plan.audience === "vendor" && !orgId) {
      return { status: "error", message: "That account does not own a vendor business." };
    }
    if (plan.audience === "hospital" && !orgId) {
      return { status: "error", message: "That account does not own a hospital." };
    }
    if (
      plan.audience === "nutritionist" &&
      !(await prisma.nutritionistProfile.findUnique({ where: { userId: user.id } }))
    ) {
      return { status: "error", message: "That account has no nutritionist profile." };
    }
    const now = new Date();
    const sub = await prisma.subscription.create({
      data: {
        planId: plan.id,
        ...(orgId ? { organizationId: orgId } : { userId: user.id }),
        status: "active",
        provider: "manual",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + days * DAY_MS),
        // A grant does not renew.
        cancelAtPeriodEnd: true,
      },
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "subscription.granted",
      targetType: "subscription",
      targetId: sub.id,
      metadata: { planId: plan.id, userId: user.id, days },
    });
    revalidatePath("/subscriptions");
    return { status: "success", message: `Plan granted for ${days} day${days === 1 ? "" : "s"}.` };
  });
}

/**
 * Ends a subscription now. For a paid one, renewals are stopped at the
 * provider first; refunds, if any, are made in the provider's dashboard.
 */
export async function endSubscriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id");
  if (!id) return FAILED;
  return asAdmin("subscriptions.manage", "subscription_end", async (admin) => {
    const prisma = getPrisma();
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: { select: { email: true } },
        // A business subscription is held by its owner's email at the provider (ADR-067).
        organization: {
          select: {
            memberships: {
              where: { role: "owner" },
              take: 1,
              select: { user: { select: { email: true } } },
            },
          },
        },
      },
    });
    if (!sub || (sub.status !== "active" && sub.status !== "past_due")) {
      return { status: "error", message: "That subscription is not active." };
    }
    if (sub.provider !== "manual" && !sub.cancelAtPeriodEnd) {
      const provider = getPaymentProvider(sub.provider);
      const result = provider
        ? await provider.cancel({
            subscriptionRef: sub.providerSubscriptionRef,
            token: sub.providerToken,
            email: sub.user?.email ?? sub.organization?.memberships[0]?.user.email ?? "",
            providerPlanId:
              sub.provider === "paystack" ? sub.plan.paystackPlanCode : sub.plan.flutterwavePlanId,
          })
        : ({ ok: false } as const);
      if (!result.ok) {
        return {
          status: "error",
          message:
            "The provider did not stop the renewal. Stop it in the provider's dashboard, then try again.",
        };
      }
    }
    await prisma.subscription.update({
      where: { id },
      data: { status: "canceled", cancelAtPeriodEnd: true, currentPeriodEnd: new Date() },
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "subscription.ended",
      targetType: "subscription",
      targetId: id,
      metadata: { provider: sub.provider },
    });
    revalidatePath("/subscriptions");
    return { status: "success", message: "Subscription ended." };
  });
}
