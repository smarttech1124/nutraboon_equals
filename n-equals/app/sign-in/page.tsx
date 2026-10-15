import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLogo } from "@admin/components/logo";
import { Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { signInAction } from "./actions";
import { AdminSignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminSignInPage() {
  if (await currentUser("admin")) redirect("/");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <AdminLogo className="mx-auto h-12 w-auto" />
      <Card title="n-equals" description="Nutraboom Equals administration. Administrators only.">
        <AdminSignInForm action={signInAction} />
      </Card>
    </main>
  );
}
