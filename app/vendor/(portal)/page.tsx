import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";
import { requireVendor } from "@/lib/vendors/server";
import { statsSince } from "@/lib/vendors/stats";
import { markNotificationsReadAction } from "@/app/nutritionist/actions";
import { submitBusinessAction } from "../actions";

export const metadata: Metadata = { title: "Vendor portal" };

/** Dashboard: review status, product performance and notifications (ADR-067). */
export default async function VendorDashboard() {
  const { user, org, status } = await requireVendor("/vendor");
  const prisma = getPrisma();
  const since = statsSince(30);
  const [profile, products, stats, notifications, entitlements] = await Promise.all([
    prisma.vendorProfile.findUniqueOrThrow({ where: { organizationId: org.id } }),
    prisma.product.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.productStat.groupBy({
      by: ["productId"],
      where: { product: { organizationId: org.id }, day: { gte: since } },
      _sum: { impressions: true, views: true, clicks: true },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    getEntitlementService().entitlementsFor({ organizationId: org.id }),
  ]);
  const statFor = (id: string) => stats.find((s) => s.productId === id)?._sum;
  const listed = status === "verified" && entitlements["vendor.listing"];
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <Card title="Your business">
        <div className="flex flex-col gap-3 text-sm">
          {status === "draft" || status === "changes_requested" ? (
            <>
              {status === "changes_requested" && profile.reviewNote && (
                <Alert tone="warning">Reviewer&apos;s note: {profile.reviewNote}</Alert>
              )}
              <p className="text-ink">
                Complete your{" "}
                <Link href="/vendor/business" className="font-semibold text-brand-text underline">
                  business profile
                </Link>
                , then submit it for review.
              </p>
              <ActionForm
                action={submitBusinessAction}
                submitLabel="Submit business for review"
                pendingLabel="Submitting…"
              />
            </>
          ) : status === "submitted" ? (
            <p className="text-ink">
              Your business is being reviewed. We will let you know the outcome.
            </p>
          ) : status === "verified" ? (
            <p className="text-ink">
              Your business is verified.{" "}
              {listed ? (
                "Verified products can be recommended to users."
              ) : (
                <>
                  Products are not recommended yet: that needs a vendor plan.{" "}
                  <Link href="/vendor/plan" className="font-semibold text-brand-text underline">
                    See plans
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <Alert tone="error">
              {status === "rejected"
                ? "Your business was not approved."
                : "Your business is suspended."}
              {profile.reviewNote ? ` Reviewer's note: ${profile.reviewNote}` : ""}
            </Alert>
          )}
        </div>
      </Card>

      <Card
        title="Products, last 30 days"
        description="Recommended: times shown to users. Opened: product page views. Where to buy: links used."
      >
        {products.length === 0 ? (
          <EmptyState title="No products yet">
            <Link href="/vendor/products/new" className="text-brand-text underline">
              Add your first product
            </Link>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Recommended
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Opened
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Where to buy
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const s = statFor(p.id);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <th scope="row" className="py-2 pr-3 font-medium">
                        <Link
                          href={`/vendor/products/${p.id}`}
                          className="text-brand-text underline"
                        >
                          {p.name}
                        </Link>
                      </th>
                      <td className="py-2 pr-3">
                        <Badge>{REVIEW_STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3">{s?.impressions ?? 0}</td>
                      <td className="py-2 pr-3">{s?.views ?? 0}</td>
                      <td className="py-2">{s?.clicks ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Notifications"
        actions={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <Button type="submit" variant="ghost">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className={n.readAt ? "text-muted" : "text-ink"}>
                <p className="font-semibold">{n.title}</p>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
