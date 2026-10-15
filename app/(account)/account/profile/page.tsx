import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordForm, ProfileForm } from "@/components/account/profile-forms";
import { Button, Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { NO_PASSWORD } from "@/lib/auth/service";
import { getPrisma } from "@/lib/db";
import { NEEDS } from "@/lib/hospitals/accessibility";
import { signOutAction } from "../../actions";
import { changePasswordAction, updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Manage profile" };

/** Your details, access needs, password and sign-out (ADR-075). */
export default async function ProfilePage() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account/profile");
  const record = await getPrisma().user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      accessibilityNeeds: true,
      passwordHash: true,
      oauthAccounts: { select: { provider: true } },
    },
  });
  const hasPassword = record.passwordHash !== NO_PASSWORD;
  const google = record.oauthAccounts.some((a) => a.provider === "google");

  return (
    <>
      <h1 className="font-display text-3xl font-bold text-ink">Manage profile</h1>
      <Card title="Your details">
        <ProfileForm
          action={updateProfileAction}
          name={user.name}
          email={user.email}
          needs={record.accessibilityNeeds}
          needOptions={Object.entries(NEEDS).map(([value, label]) => ({ value, label }))}
        />
      </Card>
      <Card title="Password" description={google ? "You can also sign in with Google." : undefined}>
        {hasPassword ? (
          <PasswordForm action={changePasswordAction} />
        ) : (
          <p className="text-sm text-ink">
            Your account doesn&apos;t have a password yet.{" "}
            <Link href="/forgot-password" className="font-semibold text-brand-text underline">
              Set one by email
            </Link>{" "}
            if you want to sign in without Google.
          </p>
        )}
      </Card>
      <Card title="Sign out" description="Sign out of Nutraboom Equals on this device.">
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </Card>
      <p className="text-sm text-muted">
        To delete your account or download your data, see our{" "}
        <Link href="/privacy" className="text-brand-text underline">
          privacy notice
        </Link>{" "}
        for how to contact us.
      </p>
    </>
  );
}
