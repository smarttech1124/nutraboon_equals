import type { Metadata } from "next";
import Link from "next/link";
import { ModuleOffNotice } from "@admin/components/listing";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/nutritionists/profile";

export const metadata: Metadata = { title: "Nutritionists" };

const FILTERS = [
  "submitted",
  "changes_requested",
  "verified",
  "suspended",
  "rejected",
  "draft",
] as const;
type Filter = (typeof FILTERS)[number];

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** The verification queue and all nutritionist profiles (ADR-064). */
export default async function NutritionistsPage({ searchParams }: PageProps<"/nutritionists">) {
  const access = await adminAccess("nutritionists.verify");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const status: Filter = FILTERS.find((f) => f === params.status) ?? "submitted";
  const prisma = getPrisma();
  const p = paging(
    pageParam(params.page),
    await prisma.nutritionistProfile.count({ where: { status } }),
  );
  const [profiles, counts] = await Promise.all([
    prisma.nutritionistProfile.findMany({
      where: { status },
      orderBy: { submittedAt: "asc" },
      skip: p.skip,
      take: p.take,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.nutritionistProfile.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nutritionists"
        description="Review submitted profiles. The AI analysis is advisory: check documents yourself before approving."
      />
      <ModuleOffNotice flag="nutritionists" label="nutritionists" />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/nutritionists?status=${f}`}
            aria-current={f === status ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${f === status ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-subtle"}`}
          >
            {STATUS_LABEL[f]} ({count(f)})
          </Link>
        ))}
      </nav>
      <Card>
        {profiles.length === 0 ? (
          <EmptyState title="Nothing here" />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {profiles.map((p) => (
              <li
                key={p.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/nutritionists/${p.userId}`}
                    className="font-semibold text-brand-text underline"
                  >
                    {p.user.name}
                  </Link>
                  <p className="text-muted">
                    {p.title || "No title"} · {p.state ?? "No state"} · {p.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge>{STATUS_LABEL[p.status]}</Badge>
                  {p.submittedAt && (
                    <span className="text-muted">Submitted {dateFormat.format(p.submittedAt)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination
        path="/nutritionists"
        query={{ status: params.status ? status : undefined }}
        paging={p}
      />
    </div>
  );
}
