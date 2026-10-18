import type { Metadata } from "next";
import { PortalSignIn } from "@/components/portal/portal-sign-in";

export const metadata: Metadata = { title: "Log in — Vendor portal" };

/** The vendor portal's own login page (ADR-089). */
export default function SignInPage({ searchParams }: PageProps<"/vendor/sign-in">) {
  return (
    <PortalSignIn
      kind="vendor"
      intro="For food businesses: your products, their review status and your plan."
      searchParams={searchParams}
    />
  );
}
