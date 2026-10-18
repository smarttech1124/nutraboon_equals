import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/account/forms";
import { GoogleButton, OrDivider } from "@/components/account/google-button";
import { Alert, Card } from "@/components/ui";
import { googleConfig } from "@/lib/auth/google";
import { signInError } from "@/lib/auth/sign-in-errors";
import { currentUser } from "@/lib/auth/next";
import { signInAction } from "../../actions";

export const metadata: Metadata = { title: "Log in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await currentUser("web")) redirect("/account");
  const { next, error } = await searchParams;
  const message = signInError(error);
  const google = googleConfig() !== null;
  const nextPath = typeof next === "string" ? next : undefined;
  return (
    <Card title="Log in">
      {message && (
        <div className="mb-4">
          <Alert tone="error">{message}</Alert>
        </div>
      )}
      {google && (
        <>
          <GoogleButton next={nextPath} />
          <OrDivider />
        </>
      )}
      <SignInForm action={signInAction} next={nextPath} />
      <p className="mt-4 text-sm text-muted">
        New here?{" "}
        <Link href="/sign-up" className="text-brand-text underline underline-offset-2">
          Create an account
        </Link>
      </p>
      <nav aria-label="Partner logins" className="mt-6 border-t border-line pt-4 text-sm">
        <p className="font-medium text-ink">Logging in for work?</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <li>
            <Link href="/hospital/sign-in" className="text-brand-text underline underline-offset-2">
              Hospital portal
            </Link>
          </li>
          <li>
            <Link href="/vendor/sign-in" className="text-brand-text underline underline-offset-2">
              Vendor portal
            </Link>
          </li>
          <li>
            <Link
              href="/nutritionist/sign-in"
              className="text-brand-text underline underline-offset-2"
            >
              Nutritionist portal
            </Link>
          </li>
        </ul>
      </nav>
    </Card>
  );
}
