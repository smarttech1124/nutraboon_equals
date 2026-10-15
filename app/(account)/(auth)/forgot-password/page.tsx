import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account/forms";
import { Card } from "@/components/ui";
import { forgotPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <Card title="Reset your password" description="We'll email you a link to choose a new one.">
      <ForgotPasswordForm action={forgotPasswordAction} />
    </Card>
  );
}
