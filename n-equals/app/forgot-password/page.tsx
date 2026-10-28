import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLogo } from "@admin/components/logo";
import { ForgotPasswordForm } from "@/components/account/forms";
import { Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { forgotAdminPasswordAction } from "../sign-in/password-actions";

export const metadata: Metadata = { title: "Reset your password" };

/** "Forgot your password?" for administrators (ADR-091). */
export default async function AdminForgotPasswordPage() {
  if (await currentUser("admin")) redirect("/");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <AdminLogo className="mx-auto h-12 w-auto" />
      <Card
        title="Reset your password"
        description="Enter your administrator email. We'll send a link to choose a new password; it works once and expires in 1 hour."
      >
        <ForgotPasswordForm action={forgotAdminPasswordAction} />
      </Card>
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-brand-text underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
