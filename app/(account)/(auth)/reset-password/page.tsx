import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/account/forms";
import { Alert, Card } from "@/components/ui";
import { resetPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <Card title="Choose a new password">
      {typeof token === "string" && token ? (
        <ResetPasswordForm action={resetPasswordAction} token={token} />
      ) : (
        <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>
      )}
    </Card>
  );
}
