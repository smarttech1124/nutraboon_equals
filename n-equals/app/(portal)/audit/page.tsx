import type { Metadata } from "next";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";

export const metadata: Metadata = { title: "Audit log" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** The latest platform audit entries (metadata only), newest first. */
export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const access = await adminAccess("audit.read");
  if (!access.ok) return <NotAllowed />;
  const prisma = getPrisma();
  const p = paging(pageParam((await searchParams).page), await prisma.auditLog.count());
  const entries = await prisma.auditLog.findMany({
    orderBy: { id: "desc" },
    skip: p.skip,
    take: p.take,
  });
  const actorIds = [...new Set(entries.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])))];
  const actors = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.id, u.email]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Who changed what, newest first. No secrets or message text are recorded."
      />
      <Card>
        {entries.length === 0 ? (
          <EmptyState title="No entries yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Who
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Target
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {dateFormat.format(e.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      {e.actorUserId ? (actors.get(e.actorUserId) ?? "deleted user") : "system"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.targetType}
                      {e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">
                      {Object.keys(e.metadata as object).length > 0
                        ? JSON.stringify(e.metadata)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination path="/audit" paging={p} />
    </div>
  );
}
