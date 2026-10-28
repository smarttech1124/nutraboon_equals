import type { Metadata } from "next";
import { AdminLogo } from "@admin/components/logo";
import { ResetPasswordForm } from "@/components/account/forms";
import { Alert, Card } from "@/components/ui";
import { resetAdminPasswordWithLinkAction } from "../sign-in/password-actions";

export const metadata: Metadata = { title: "Choose a new password" };

/** Opened from an administrator's reset email (ADR-091). Ends every session of the account. */
export default async function AdminResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <AdminLogo className="mx-auto h-12 w-auto" />
      <Card title="Choose a new password">
        {typeof token === "string" && token ? (
          <ResetPasswordForm action={resetAdminPasswordWithLinkAction} token={token} />
        ) : (
          <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>
        )}
      </Card>
    </main>
  );
}
