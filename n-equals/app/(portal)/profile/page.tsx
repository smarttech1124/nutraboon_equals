import type { Metadata } from "next";
import { PageHeader } from "@admin/components/shell";
import { AdminNameForm, SignOutOthersForm } from "@admin/components/profile";
import { adminAccess } from "@admin/lib/access";
import { PasswordForm } from "@/components/account/profile-forms";
import { Badge, Button, Card } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { NO_PASSWORD } from "@/lib/auth/service";
import { getPrisma } from "@/lib/db";
import { signOutAction } from "../../sign-in/actions";
import {
  changeAdminPasswordAction,
  signOutOtherSessionsAction,
  updateAdminNameAction,
} from "./actions";

export const metadata: Metadata = { title: "My profile" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** The signed-in administrator's own account (ADR-080). */
export default async function ProfilePage() {
  const access = await adminAccess();
  if (!access.ok) return null;
  const { user } = access;
  const now = new Date();
  const record = await getPrisma().user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      passwordHash: true,
      createdAt: true,
      sessions: {
        where: { expiresAt: { gt: now } },
        orderBy: { lastSeenAt: "desc" },
        select: { app: true, lastSeenAt: true },
      },
    },
  });
  const others = Math.max(0, record.sessions.length - 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My profile" description="Your administrator account." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your details">
          <AdminNameForm action={updateAdminNameAction} name={user.name} email={user.email} />
        </Card>
        <Card title="Access">
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-muted">Roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {user.adminRoles.map((r) => (
                  <Badge key={r} tone="success">
                    {ROLE_LABEL[r]}
                  </Badge>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Account created</dt>
              <dd className="text-ink">{dateFormat.format(record.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Signed-in sessions</dt>
              <dd className="text-ink">
                {record.sessions.length} (this one and {others} other{others === 1 ? "" : "s"}, on
                the main site or n-equals)
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">Roles are changed by a super administrator.</p>
        </Card>
      </div>
      <Card title="Password">
        {record.passwordHash === NO_PASSWORD ? (
          <p className="text-sm text-ink">
            Your account has no password yet (it was made with Google). Set one with “Forgot your
            password?” on the main site.
          </p>
        ) : (
          <PasswordForm action={changeAdminPasswordAction} />
        )}
      </Card>
      <Card
        title="Sessions"
        description="End every other session of your account, for example on a shared computer."
      >
        <div className="flex flex-wrap items-start gap-3">
          <SignOutOthersForm action={signOutOtherSessionsAction} />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sign out here
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
