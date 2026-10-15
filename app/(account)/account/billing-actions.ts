"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { getPaymentProvider } from "@/lib/payments";
import { ownerOf, planHolderOrgId } from "@/lib/vendors/ownership";
import type { AccountFormState } from "../actions";

/** Checkout and renewal changes from the account page (ADR-063). */

const FAILED: AccountFormState = {
  status: "error",
  message: "We could not start the payment. Nothing was charged; please try again.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function startCheckoutAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  if (!user.emailVerified) {
    return { status: "error", message: "Confirm your email address before subscribing." };
  }
  if (!(await getEntitlementService().isEnabled("payments"))) {
    return { status: "error", message: "Paid plans are not available yet." };
  }
  const kind = field(formData, "provider");
  if (kind !== "paystack" && kind !== "flutterwave") return FAILED;
  const provider = getPaymentProvider(kind);
  if (!provider) return FAILED;

  let url: string;
  try {
    const prisma = getPrisma();
    const plan = await prisma.plan.findFirst({
      where: {
        id: field(formData, "planId"),
        active: true,
        audience: { in: ["user", "nutritionist", "vendor", "hospital"] },
      },
    });
    // Nutritionist plans are for accounts with a nutritionist profile (ADR-064).
    if (
      plan?.audience === "nutritionist" &&
      !(await prisma.nutritionistProfile.findUnique({ where: { userId: user.id } }))
    ) {
      return FAILED;
    }
    // Vendor and hospital plans belong to the organisation the user owns (ADR-067, ADR-068).
    const orgId = plan ? await planHolderOrgId(user.id, plan.audience) : null;
    if ((plan?.audience === "vendor" || plan?.audience === "hospital") && !orgId) return FAILED;
    const providerPlanId = kind === "paystack" ? plan?.paystackPlanCode : plan?.flutterwavePlanId;
    if (!plan || !providerPlanId) return FAILED;

    const reference = `nbe_${randomBytes(12).toString("base64url")}`;
    await prisma.subscription.create({
      data: {
        planId: plan.id,
        ...(orgId ? { organizationId: orgId } : { userId: user.id }),
        status: "pending",
        provider: kind,
        checkoutReference: reference,
      },
    });
    const checkout = await provider.startCheckout({
      reference,
      email: user.email,
      name: user.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      providerPlanId,
      callbackUrl: `${appUrl()}/account/billing/return?provider=${kind}`,
    });
    if (!checkout.ok) {
      await prisma.subscription.update({
        where: { checkoutReference: reference },
        data: { status: "expired" },
      });
      log("checkout_failed", kind, checkout.error);
      return FAILED;
    }
    url = checkout.url;
  } catch (error) {
    log("checkout_error", kind, error instanceof Error ? error.name : "unknown");
    return FAILED;
  }
  redirect(url);
}

export async function cancelRenewalAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  try {
    const prisma = getPrisma();
    const sub = await prisma.subscription.findFirst({
      where: {
        id: field(formData, "subscriptionId"),
        OR: [{ userId: user.id }, { organization: ownerOf(user.id) }],
        status: { in: ["active", "past_due"] },
        cancelAtPeriodEnd: false,
      },
      include: { plan: true },
    });
    if (!sub) return { status: "error", message: "That subscription is not active." };
    if (sub.provider !== "manual") {
      const provider = getPaymentProvider(sub.provider);
      const result = provider
        ? await provider.cancel({
            subscriptionRef: sub.providerSubscriptionRef,
            token: sub.providerToken,
            email: user.email,
            providerPlanId:
              sub.provider === "paystack" ? sub.plan.paystackPlanCode : sub.plan.flutterwavePlanId,
          })
        : ({ ok: false, error: "not_configured" } as const);
      if (!result.ok) {
        log("cancel_failed", sub.provider, result.error);
        return {
          status: "error",
          message: "We could not stop the renewal right now. Please try again later.",
        };
      }
    }
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    await recordAudit({
      actorUserId: user.id,
      action: "subscription.renewal_canceled",
      targetType: "subscription",
      targetId: sub.id,
    });
  } catch (error) {
    log("cancel_error", "unknown", error instanceof Error ? error.name : "unknown");
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
  revalidatePath("/account", "layout");
  revalidatePath("/nutritionist/plan");
  revalidatePath("/vendor/plan");
  revalidatePath("/hospital/plan");
  return {
    status: "success",
    message: "Renewal stopped. Your plan stays active until the end of the paid period.",
  };
}

function log(event: string, provider: string, error: string) {
  console.error(JSON.stringify({ event: `billing_${event}`, provider, error }));
}
