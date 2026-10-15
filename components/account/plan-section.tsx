import { CancelRenewalForm, CheckoutForm, type CheckoutOption } from "@/components/account/billing";
import { Badge, Card } from "@/components/ui";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { ENTITLEMENT_KEYS, ENTITLEMENTS, parseEntitlements } from "@/lib/billing/entitlements";
import { describeEntitlement } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";
import { configuredProviders } from "@/lib/payments";
import { PROVIDER_LABEL } from "@/lib/payments/types";
import { cancelRenewalAction, startCheckoutAction } from "@/app/(account)/account/billing-actions";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

export function formatPrice(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(minor / 100);
}

/**
 * The account's plan, what it includes, and the plans it can move to
 * (ADR-062, ADR-063, ADR-075). Every active plan is listed; checkout appears
 * only where payments are switched on and the plan is set up with a provider.
 * Nothing is simulated: without a working payment, no plan can be chosen here.
 */
export async function PlanSection({
  user,
  audience = "user",
  organizationId,
}: {
  user: AuthUser;
  /** Which plans to offer: user plans on the account page, nutritionist plans in the portal. */
  audience?: "user" | "nutritionist" | "vendor" | "hospital";
  /** For vendor plans: the business that holds the subscription (ADR-067). */
  organizationId?: string;
}) {
  const service = getEntitlementService();
  const prisma = getPrisma();
  const [entitlements, paymentsOn, subscriptions] = await Promise.all([
    service.entitlementsFor(organizationId ? { organizationId } : { userId: user.id }),
    service.isEnabled("payments"),
    prisma.subscription.findMany({
      where: {
        ...(organizationId ? { organizationId } : { userId: user.id }),
        status: { in: ["active", "past_due"] },
        plan: { audience },
      },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const providers = paymentsOn ? configuredProviders() : [];
  const plans = await prisma.plan.findMany({
    where: { active: true, audience },
    orderBy: { priceMinor: "asc" },
  });
  const currentPlanIds = new Set(subscriptions.map((s) => s.planId));

  return (
    <>
      <Card title="Your plan" description={subscriptions.length === 0 ? "Free plan" : undefined}>
        <div className="flex flex-col gap-4">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{sub.plan.name}</span>
                {sub.status === "past_due" ? (
                  <Badge tone="warning">Payment due</Badge>
                ) : (
                  <Badge tone="success">Active</Badge>
                )}
              </div>
              {sub.currentPeriodEnd && (
                <p className="text-sm text-muted">
                  {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on{" "}
                  {dateFormat.format(sub.currentPeriodEnd)}
                </p>
              )}
              {!sub.cancelAtPeriodEnd && (
                <CancelRenewalForm action={cancelRenewalAction} subscriptionId={sub.id} />
              )}
            </div>
          ))}
          <dl className="grid gap-1 text-sm">
            {ENTITLEMENT_KEYS.filter((key) =>
              key.startsWith(audience === "user" ? "mealPlanner." : `${audience}.`),
            ).map((key) => (
              <div key={key} className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">{ENTITLEMENTS[key].label}</dt>
                <dd className="font-medium text-ink">
                  {describeEntitlement(key, entitlements[key])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
      {plans.length > 0 && (
        <Card
          title="Available plans"
          description={
            providers.length > 0
              ? "Paid securely with Paystack or Flutterwave. You can stop renewal at any time. To switch plans, subscribe to the new one and stop renewal of your current plan."
              : "Online payment isn't switched on yet, so plans can't be bought here for now."
          }
        >
          <ul className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => {
              const options: CheckoutOption[] = providers
                .filter((p) => (p === "paystack" ? plan.paystackPlanCode : plan.flutterwavePlanId))
                .map((p) => ({ provider: p, label: PROVIDER_LABEL[p] }));
              const current = currentPlanIds.has(plan.id);
              const included = parseEntitlements(plan.entitlements);
              return (
                <li
                  key={plan.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 ${current ? "border-brand bg-brand-soft" : "border-line"}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-ink">
                      {plan.name} {current && <Badge tone="success">Your plan</Badge>}
                    </h3>
                    <span className="text-sm font-semibold text-ink">
                      {formatPrice(plan.priceMinor, plan.currency)} /{" "}
                      {plan.interval === "monthly" ? "month" : "year"}
                    </span>
                  </div>
                  {plan.description && <p className="text-sm text-muted">{plan.description}</p>}
                  <dl className="grid gap-1 text-sm">
                    {ENTITLEMENT_KEYS.filter((key) => key in included).map((key) => (
                      <div key={key} className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted">{ENTITLEMENTS[key].label}</dt>
                        <dd className="font-medium text-ink">
                          {describeEntitlement(key, included[key]!)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {current ? null : options.length === 0 ? (
                    <p className="text-sm text-muted">Not available to buy online yet.</p>
                  ) : user.emailVerified ? (
                    <CheckoutForm
                      action={startCheckoutAction}
                      planId={plan.id}
                      planName={plan.name}
                      options={options}
                    />
                  ) : (
                    <p className="text-sm text-muted">Confirm your email address to subscribe.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
