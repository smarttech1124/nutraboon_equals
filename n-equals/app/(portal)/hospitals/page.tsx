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

export const metadata: Metadata = { title: "Hospitals" };

const FILTERS = [
  "submitted",
  "verified",
  "changes_requested",
  "suspended",
  "rejected",
  "draft",
] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = {
  submitted: "Needs review",
  verified: "Verified",
  changes_requested: "Changes requested",
  suspended: "Suspended",
  rejected: "Not approved",
  draft: "Draft",
};

/** Hospitals, waiting reviews first (ADR-068). */
export default async function HospitalsPage({ searchParams }: PageProps<"/hospitals">) {
  const access = await adminAccess("hospitals.verify");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const filter: Filter = FILTERS.find((f) => f === params.status) ?? "submitted";
  const prisma = getPrisma();
  const where = { status: filter };
  const [total, counts] = await Promise.all([
    prisma.hospitalProfile.count({ where }),
    prisma.hospitalProfile.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (f: Filter) => counts.find((c) => c.status === f)?._count ?? 0;
  const p = paging(pageParam(params.page), total);
  const hospitals = await prisma.hospitalProfile.findMany({
    where,
    orderBy: { submittedAt: "asc" },
    skip: p.skip,
    take: p.take,
    include: {
      organization: {
        select: { name: true, _count: { select: { departments: true, memberships: true } } },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hospitals"
        description="Check each hospital's registration and contact details before it is shown to patients."
      />
      <ModuleOffNotice flag="hospitals" label="hospitals" />
      <nav aria-label="Filter hospitals" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/hospitals?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${f === filter ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-subtle"}`}
          >
            {LABEL[f]} ({count(f)})
          </Link>
        ))}
      </nav>
      <Card>
        {hospitals.length === 0 ? (
          <EmptyState title="Nothing here" />
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {hospitals.map((h) => (
              <li
                key={h.organizationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="flex flex-col">
                  <Link
                    href={`/hospitals/${h.organizationId}`}
                    className="font-semibold text-brand-text underline"
                  >
                    {h.organization.name}
                  </Link>
                  <span className="text-muted">
                    {[h.city, h.state].filter(Boolean).join(", ") || "No location"} ·{" "}
                    {h.organization._count.departments}{" "}
                    {h.organization._count.departments === 1 ? "department" : "departments"} ·{" "}
                    {h.organization._count.memberships} staff
                  </span>
                </span>
                <Badge>{REVIEW_STATUS_LABEL[h.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination
        path="/hospitals"
        query={{ status: params.status ? filter : undefined }}
        paging={p}
      />
    </div>
  );
}
