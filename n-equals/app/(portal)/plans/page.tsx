import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { EntitlementFields } from "@admin/components/entitlement-fields";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { Badge, Card, EmptyState, Field, SelectField } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getEntitlementService } from "@/lib/billing";
import { ENTITLEMENT_KEYS, ENTITLEMENTS, parseEntitlements } from "@/lib/billing/entitlements";
import { describeEntitlement } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";
import { createPlanAction, setPlanActiveAction, updatePlanAction } from "./actions";

export const metadata: Metadata = { title: "Plans" };

type PlanValues = {
  name: string;
  description: string | null;
  audience: string;
  interval: string;
  priceMinor: number;
  paystackPlanCode: string | null;
  flutterwavePlanId: string | null;
};

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(minor / 100);
}

function PlanFields({ idPrefix, plan }: { idPrefix: string; plan?: PlanValues }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-name`} name="name" label="Name" defaultValue={plan?.name} required />
      <Field
        id={`${idPrefix}-price`}
        name="price"
        label="Price (₦)"
        inputMode="decimal"
        defaultValue={plan ? String(plan.priceMinor / 100) : ""}
        required
      />
      <SelectField
        id={`${idPrefix}-audience`}
        name="audience"
        label="For"
        defaultValue={plan?.audience ?? "user"}
      >
        <option value="user">Users</option>
        <option value="nutritionist">Nutritionists</option>
        <option value="vendor">Vendors</option>
        <option value="hospital">Hospitals</option>
      </SelectField>
      <SelectField
        id={`${idPrefix}-interval`}
        name="interval"
        label="Billed"
        defaultValue={plan?.interval ?? "monthly"}
      >
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </SelectField>
      <Field
        id={`${idPrefix}-paystack`}
        name="paystackPlanCode"
        label="Paystack plan code"
        hint="From the Paystack dashboard. Leave blank to not offer Paystack."
        defaultValue={plan?.paystackPlanCode ?? ""}
      />
      <Field
        id={`${idPrefix}-flutterwave`}
        name="flutterwavePlanId"
        label="Flutterwave payment plan id"
        hint="From the Flutterwave dashboard. Leave blank to not offer Flutterwave."
        defaultValue={plan?.flutterwavePlanId ?? ""}
      />
      <div className="sm:col-span-2">
        <Field
          id={`${idPrefix}-description`}
          name="description"
          label="Description"
          hint="Shown to subscribers. Optional."
          defaultValue={plan?.description ?? ""}
        />
      </div>
    </div>
  );
}

/** Subscription plans and what each includes (ADR-062). */
export default async function PlansPage() {
  const access = await adminAccess("plans.read");
  if (!access.ok) return <NotAllowed />;
  const canManage = can(access.user.adminRoles, "plans.manage");
  const [plans, free] = await Promise.all([
    getPrisma().plan.findMany({
      orderBy: [{ active: "desc" }, { audience: "asc" }, { priceMinor: "asc" }],
      include: {
        _count: {
          select: { subscriptions: { where: { status: { in: ["active", "past_due"] } } } },
        },
      },
    }),
    getEntitlementService().freeTier(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plans"
        description="Paid plans and what they unlock. Blank limits fall back to the free tier, set under Settings."
      />
      {plans.length === 0 ? (
        <Card>
          <EmptyState title="No plans yet">Everyone is on the free tier.</EmptyState>
        </Card>
      ) : (
        plans.map((plan) => {
          const entitlements = parseEntitlements(plan.entitlements);
          return (
            <Card
              key={plan.id}
              title={plan.name}
              description={`${plan.code} · ${money(plan.priceMinor, plan.currency)} ${
                plan.interval === "monthly" ? "a month" : "a year"
              } · for ${plan.audience}s · ${plan._count.subscriptions} active subscriber${
                plan._count.subscriptions === 1 ? "" : "s"
              }`}
              actions={plan.active ? <Badge tone="success">Offered</Badge> : <Badge>Retired</Badge>}
            >
              <dl className="mb-4 grid gap-1 text-sm">
                {ENTITLEMENT_KEYS.map((key) => (
                  <div key={key} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted">{ENTITLEMENTS[key].label}</dt>
                    <dd className="text-ink">
                      {entitlements[key] === undefined
                        ? `Free tier (${describeEntitlement(key, free[key])})`
                        : describeEntitlement(key, entitlements[key])}
                    </dd>
                  </div>
                ))}
              </dl>
              {canManage && (
                <div className="flex flex-col gap-3">
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">
                      Edit plan
                    </summary>
                    <div className="mt-4">
                      <ActionForm action={updatePlanAction} submitLabel="Save plan">
                        <input type="hidden" name="id" value={plan.id} />
                        <PlanFields idPrefix={`p-${plan.id}`} plan={plan} />
                        <EntitlementFields
                          idPrefix={`p-${plan.id}`}
                          values={entitlements}
                          placeholders={free}
                        />
                      </ActionForm>
                    </div>
                  </details>
                  <ActionForm
                    action={setPlanActiveAction}
                    submitLabel={plan.active ? "Retire plan" : "Offer plan again"}
                    variant={plan.active ? "danger" : "secondary"}
                    confirm={
                      plan.active
                        ? `Retire ${plan.name}? No new checkouts; current subscribers keep it.`
                        : undefined
                    }
                  >
                    <input type="hidden" name="id" value={plan.id} />
                    <input type="hidden" name="active" value={plan.active ? "false" : "true"} />
                  </ActionForm>
                </div>
              )}
            </Card>
          );
        })
      )}
      {canManage && (
        <Card
          title="New plan"
          description="Create the matching plan at Paystack and/or Flutterwave first, with the same price and interval."
        >
          <ActionForm action={createPlanAction} submitLabel="Create plan">
            <Field
              id="new-code"
              name="code"
              label="Code"
              hint="A permanent id, e.g. family-monthly."
              required
            />
            <PlanFields idPrefix="new" />
            <EntitlementFields idPrefix="new" values={{}} placeholders={free} />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
