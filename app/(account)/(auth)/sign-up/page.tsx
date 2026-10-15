import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/account/forms";
import { GoogleButton, OrDivider } from "@/components/account/google-button";
import { Card } from "@/components/ui";
import { googleConfig } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/next";
import { signUpAction } from "../../actions";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  if (await currentUser("web")) redirect("/account");
  const { next } = await searchParams;
  const google = googleConfig() !== null;
  const nextPath = typeof next === "string" ? next : undefined;
  return (
    <Card
      title="Create your account"
      description="Save your settings and plans. The chat works without an account."
    >
      {google && (
        <>
          <GoogleButton next={nextPath} />
          <OrDivider />
        </>
      )}
      <SignUpForm action={signUpAction} next={nextPath} />
      <p className="mt-4 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-brand-text underline underline-offset-2">
          Log in
        </Link>
      </p>
    </Card>
  );
}
