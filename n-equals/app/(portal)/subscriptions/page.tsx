import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState, Field, SelectField } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import { endSubscriptionAction, grantAction } from "./actions";

export const metadata: Metadata = { title: "Subscriptions" };

const STATUSES = ["active", "past_due", "pending", "canceled", "expired"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  past_due: "Payment due",
  pending: "Awaiting payment",
  canceled: "Canceled",
  expired: "Expired",
};
const PROVIDER_LABEL = { paystack: "Paystack", flutterwave: "Flutterwave", manual: "Granted" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** Subscriptions with their status and period, plus manual grants (ADR-062). */
export default async function SubscriptionsPage({ searchParams }: PageProps<"/subscriptions">) {
  const access = await adminAccess("subscriptions.read");
  if (!access.ok) return <NotAllowed />;
  const canManage = can(access.user.adminRoles, "subscriptions.manage");
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);

  const prisma = getPrisma();
  const where = status ? { status } : { status: { in: ["active" as const, "past_due" as const] } };
  const p = paging(pageParam(params.page), await prisma.subscription.count({ where }));
  const [subscriptions, plans] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: p.skip,
      take: p.take,
      include: {
        plan: { select: { name: true } },
        user: { select: { email: true } },
        organization: { select: { name: true } },
      },
    }),
    canManage
      ? prisma.plan.findMany({
          where: { audience: { in: ["user", "nutritionist", "vendor", "hospital"] } },
          orderBy: [{ audience: "asc" }, { priceMinor: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subscriptions" description="Newest first, for the chosen status." />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        {[undefined, ...STATUSES].map((s) => {
          const current = s === status;
          return (
            <Link
              key={s ?? "current"}
              href={s ? `/subscriptions?status=${s}` : "/subscriptions"}
              aria-current={current ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${current ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-subtle"}`}
            >
              {s ? STATUS_LABEL[s] : "Current"}
            </Link>
          );
        })}
      </nav>
      <Card>
        {subscriptions.length === 0 ? (
          <EmptyState title="No subscriptions here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Subscriber
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Plan
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Via
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Paid until
                  </th>
                  {canManage && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-3 py-3 font-medium break-all text-ink">
                      {sub.user?.email ?? sub.organization?.name ?? "—"}
                    </th>
                    <td className="px-3 py-3">{sub.plan.name}</td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          sub.status === "active"
                            ? "success"
                            : sub.status === "past_due"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {STATUS_LABEL[sub.status]}
                      </Badge>
                      {sub.cancelAtPeriodEnd && sub.status === "active" && (
                        <span className="ml-2 text-muted">does not renew</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{PROVIDER_LABEL[sub.provider]}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {sub.currentPeriodEnd ? dateFormat.format(sub.currentPeriodEnd) : "—"}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        {(sub.status === "active" || sub.status === "past_due") && (
                          <ActionForm
                            action={endSubscriptionAction}
                            submitLabel="End now"
                            pendingLabel="Ending…"
                            variant="danger"
                            confirm="End this subscription now? Access stops at once. Refunds are made in the provider's dashboard."
                            className="flex flex-col gap-2"
                          >
                            <input type="hidden" name="id" value={sub.id} />
                          </ActionForm>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination path="/subscriptions" query={{ status }} paging={p} />
      {canManage && (
        <Card
          title="Grant a plan"
          description="Gives a plan without payment for a set number of days. It does not renew."
        >
          {plans.length === 0 ? (
            <p className="text-sm text-muted">Create a plan for users first.</p>
          ) : (
            <ActionForm action={grantAction} submitLabel="Grant plan">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="grant-email" name="email" type="email" label="Account email" required />
                <SelectField id="grant-plan" name="planId" label="Plan">
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                      {plan.audience === "user" ? "" : ` (${plan.audience}s)`}
                      {plan.active ? "" : " (retired)"}
                    </option>
                  ))}
                </SelectField>
                <Field
                  id="grant-days"
                  name="days"
                  type="number"
                  min={1}
                  max={366}
                  defaultValue="30"
                  label="Days"
                  required
                />
              </div>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
