import type { Metadata } from "next";
import { Pagination } from "@admin/components/pagination";
import { NotAllowed, PageHeader, SearchForm } from "@admin/components/shell";
import { AddAdminForm, ResetAdminPasswordForm, RoleEditor } from "@admin/components/users";
import { adminAccess } from "@admin/lib/access";
import { pageParam, paging } from "@admin/lib/pagination";
import { Badge, Card, EmptyState } from "@/components/ui";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { addAdminAction, resetAdminPasswordAction, setAdminRoleAction } from "./actions";

export const metadata: Metadata = { title: "Administrators" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** Accounts with an n-equals role, and what each may do (ADR-061, ADR-080). */
export default async function AdminsPage({ searchParams }: PageProps<"/admins">) {
  const access = await adminAccess("users.read");
  if (!access.ok) return <NotAllowed />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const canRoles = can(access.user.adminRoles, "roles.manage");

  const prisma = getPrisma();
  const where: Prisma.UserWhereInput = {
    adminRoles: { some: {} },
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
  const admins = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    skip: p.skip,
    take: p.take,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      adminRoles: { select: { role: true } },
      sessions: {
        where: { app: "admin" },
        orderBy: { lastSeenAt: "desc" },
        take: 1,
        select: { lastSeenAt: true },
      },
    },
  });
  // Everyone else who could need a reset (administrators are few).
  const resettable = canRoles
    ? await prisma.user.findMany({
        where: { adminRoles: { some: {} }, status: "active", id: { not: access.user.id } },
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true, email: true },
      })
    : [];
  const count = `${p.total} administrator${p.total === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Administrators"
        description={`${count}. Removing every role makes an account an ordinary platform user.`}
      />
      <SearchForm q={q} label="Search administrators" />
      <Card title="Administrator accounts">
        {admins.length === 0 ? (
          <EmptyState title={q ? "No matching administrators" : "No administrators"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  {["Name", "Email", "Status", "Roles", "Last in n-equals"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.map((u) => {
                  const roles = u.adminRoles.map((r) => r.role);
                  return (
                    <tr key={u.id} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="px-3 py-3 font-medium text-ink">
                        {u.name}
                        {u.id === access.user.id && <span className="text-muted"> (you)</span>}
                      </th>
                      <td className="px-3 py-3 break-all">{u.email}</td>
                      <td className="px-3 py-3">
                        <Badge tone={u.status === "active" ? "success" : "error"}>
                          {u.status === "active" ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        {canRoles ? (
                          <RoleEditor
                            action={setAdminRoleAction}
                            userId={u.id}
                            name={u.name}
                            roles={roles}
                          />
                        ) : (
                          roles.map((r) => ROLE_LABEL[r]).join(", ")
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted">
                        {u.sessions[0] ? dateFormat.format(u.sessions[0].lastSeenAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination path="/admins" query={{ q }} paging={p} />
      {canRoles && resettable.length > 0 && (
        <Card
          title="Reset an administrator's password"
          description="For a forgotten password or an account that may be compromised. Their password stops working, they are signed out everywhere, and a one-hour reset link is emailed to them. You never see or set their new password."
        >
          <ResetAdminPasswordForm action={resetAdminPasswordAction} admins={resettable} />
        </Card>
      )}
      {canRoles && (
        <Card
          title="Add an administrator"
          description="Give a role to an existing account, or create a new administrator account."
        >
          <AddAdminForm action={addAdminAction} />
        </Card>
      )}
    </div>
  );
}
