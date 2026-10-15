import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/account/forms";
import { Alert, Card } from "@/components/ui";
import { verifyEmailAction } from "../../actions";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  return (
    <Card title="Confirm your email">
      {typeof token === "string" && token ? (
        <VerifyEmailForm action={verifyEmailAction} token={token} />
      ) : (
        <Alert tone="error">This link is incomplete. Send a new one from your account page.</Alert>
      )}
    </Card>
  );
}
