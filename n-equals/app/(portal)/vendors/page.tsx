import type { Metadata } from "next";
import Link from "next/link";
import { ModuleOffNotice } from "@admin/components/listing";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";

export const metadata: Metadata = { title: "Vendors" };

const FILTERS = [
  "review",
  "verified",
  "changes_requested",
  "suspended",
  "rejected",
  "draft",
] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = {
  review: "Needs review",
  verified: "Verified",
  changes_requested: "Changes requested",
  suspended: "Suspended",
  rejected: "Not approved",
  draft: "Draft",
};

/** Vendor businesses, with those that have something to review first (ADR-067). */
export default async function VendorsPage({ searchParams }: PageProps<"/vendors">) {
  const access = await adminAccess("vendors.verify");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const filter: Filter = FILTERS.find((f) => f === params.status) ?? "review";
  const where =
    filter === "review"
      ? {
          OR: [
            { status: "submitted" as const },
            { organization: { products: { some: { status: "submitted" as const } } } },
          ],
        }
      : { status: filter };
  const prisma = getPrisma();
  const reviewWhere = {
    OR: [
      { status: "submitted" as const },
      { organization: { products: { some: { status: "submitted" as const } } } },
    ],
  };
  const [total, counts, needsReview] = await Promise.all([
    prisma.vendorProfile.count({ where }),
    prisma.vendorProfile.groupBy({ by: ["status"], _count: true }),
    // "Needs review" also counts verified vendors with a product waiting.
    prisma.vendorProfile.count({ where: reviewWhere }),
  ]);
  const count = (f: Filter) =>
    f === "review" ? needsReview : (counts.find((c) => c.status === f)?._count ?? 0);
  const p = paging(pageParam(params.page), total);
  const vendors = await prisma.vendorProfile.findMany({
    where,
    orderBy: { submittedAt: "asc" },
    skip: p.skip,
    take: p.take,
    include: {
      organization: {
        select: {
          name: true,
          _count: { select: { products: { where: { status: "submitted" } } } },
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendors"
        description="Review businesses and their products. Claims checks are automatic; you still read every product."
      />
      <ModuleOffNotice flag="vendors" label="vendors" />
      <nav aria-label="Filter vendors" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/vendors?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${f === filter ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-subtle"}`}
          >
            {LABEL[f]} ({count(f)})
          </Link>
        ))}
      </nav>
      <Card>
        {vendors.length === 0 ? (
          <EmptyState title="Nothing here" />
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {vendors.map((v) => (
              <li
                key={v.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <Link
                  href={`/vendors/${v.organizationId}`}
                  className="font-semibold text-brand-text underline"
                >
                  {v.organization.name}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge>{REVIEW_STATUS_LABEL[v.status]}</Badge>
                  {v.organization._count.products > 0 && (
                    <Badge tone="warning">
                      {v.organization._count.products} product
                      {v.organization._count.products === 1 ? "" : "s"} to review
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination
        path="/vendors"
        query={{ status: params.status ? filter : undefined }}
        paging={p}
      />
    </div>
  );
}
