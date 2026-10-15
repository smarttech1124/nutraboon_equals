import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import {
  PRODUCT_CATEGORIES,
  REVIEW_STATUS_LABEL,
  isProductCategory,
} from "@/lib/vendors/categories";
import { requireVendor } from "@/lib/vendors/server";

export const metadata: Metadata = { title: "Products — Vendor portal" };

export default async function ProductsPage() {
  const { org } = await requireVendor("/vendor/products");
  const [products, entitlements] = await Promise.all([
    getPrisma().product.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, category: true, status: true },
    }),
    getEntitlementService().entitlementsFor({ organizationId: org.id }),
  ]);
  const limit = entitlements["vendor.maxProducts"];

  return (
    <Card
      title="Products"
      description={`${products.length} of ${limit} product${limit === 1 ? "" : "s"} your plan allows.`}
      actions={
        products.length < limit ? (
          <Link
            href="/vendor/products/new"
            className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
          >
            Add a product
          </Link>
        ) : undefined
      }
    >
      {products.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                href={`/vendor/products/${p.id}`}
                className="font-semibold text-brand-text underline"
              >
                {p.name}
              </Link>
              <span className="flex items-center gap-2 text-muted">
                {isProductCategory(p.category) ? PRODUCT_CATEGORIES[p.category] : p.category}
                <Badge tone={p.status === "verified" ? "success" : "neutral"}>
                  {REVIEW_STATUS_LABEL[p.status]}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
