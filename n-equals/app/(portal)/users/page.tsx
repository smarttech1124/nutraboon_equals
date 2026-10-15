import type { Metadata } from "next";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader, SearchForm } from "@admin/components/shell";
import { DeleteUserButton, StatusToggle } from "@admin/components/users";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deleteUserAction, setUserStatusAction } from "./actions";

export const metadata: Metadata = { title: "Platform users" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/**
 * People who use Nutraboom Equals (ADR-061, ADR-080): search, suspension and
 * deletion. Administrators are listed under Administrators instead.
 */
export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const access = await adminAccess("users.read");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const prisma = getPrisma();
  const where: Prisma.UserWhereInput = {
    adminRoles: { none: {} },
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const p = paging(pageParam(params.page), await prisma.user.count({ where }));
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: p.skip,
    take: p.take,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      sessions: {
        where: { app: "web" },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
        select: { lastSeenAt: true },
      },
    },
  });
  const roles = access.user.adminRoles;
  const canManage = can(roles, "users.manage");
  const canDelete = can(roles, "users.delete");
  const accounts = `${p.total} account${p.total === 1 ? "" : "s"}${q ? " match your search" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform users"
        description={`${accounts}. Administrators are listed under Administrators.`}
      />
      <SearchForm q={q} label="Search by name or email" />
      <Card title="Accounts">
        {users.length === 0 ? (
          <EmptyState title={q ? "No matching accounts" : "No accounts yet"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  {["Name", "Email", "Status", "Joined", "Last active"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                  {(canManage || canDelete) && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-3 py-3 font-medium text-ink">
                      {u.name}
                    </th>
                    <td className="px-3 py-3">
                      <span className="break-all">{u.email}</span>
                      {!u.emailVerifiedAt && (
                        <span className="ml-2">
                          <Badge>Unconfirmed</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={u.status === "active" ? "success" : "error"}>
                        {u.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {dateFormat.format(u.createdAt)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {u.sessions[0] ? dateFormat.format(u.sessions[0].lastSeenAt) : "—"}
                    </td>
                    {(canManage || canDelete) && (
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canManage && (
                            <StatusToggle
                              action={setUserStatusAction}
                              userId={u.id}
                              name={u.name}
                              suspended={u.status === "suspended"}
                            />
                          )}
                          {canDelete && (
                            <DeleteUserButton
                              action={deleteUserAction}
                              userId={u.id}
                              name={u.name}
                              email={u.email}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination path="/users" query={{ q }} paging={p} />
    </div>
  );
}
