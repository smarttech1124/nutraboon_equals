import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/(account)/actions";
import { SignInForm } from "@/components/account/forms";
import { GoogleButton, OrDivider } from "@/components/account/google-button";
import { Alert, Card } from "@/components/ui";
import { googleConfig } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/next";
import { signInError } from "@/lib/auth/sign-in-errors";
import { PORTALS, type PortalKind } from "./portal-shell";

/**
 * A portal's own login page (ADR-089). The account is the same Nutraboom
 * Equals account, but signing in here opens the portal, and the page says
 * clearly which portal it is. The portal then checks the person's role.
 */
export async function PortalSignIn({
  kind,
  intro,
  searchParams,
}: {
  kind: PortalKind;
  intro: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portal = PORTALS[kind];
  const { next, error } = await searchParams;
  // Only paths inside this portal: a crafted link cannot send people elsewhere.
  const nextPath =
    typeof next === "string" && next.startsWith(portal.home) && !next.startsWith("//")
      ? next
      : portal.home;
  if (await currentUser("web")) redirect(nextPath);
  const message = signInError(error);
  const google = googleConfig() !== null;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Card title={`Log in to the ${portal.name.toLowerCase()}`} description={intro}>
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
          <Link href={portal.join} className="text-brand-text underline underline-offset-2">
            {portal.joinLabel}
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted">
          Not a partner?{" "}
          <Link href="/sign-in" className="text-brand-text underline underline-offset-2">
            Log in to your personal account
          </Link>
        </p>
      </Card>
    </div>
  );
}
