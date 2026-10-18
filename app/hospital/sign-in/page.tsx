import type { Metadata } from "next";
import { PortalSignIn } from "@/components/portal/portal-sign-in";

export const metadata: Metadata = { title: "Log in — Hospital portal" };

/** The hospital portal's own login page (ADR-089). */
export default function SignInPage({ searchParams }: PageProps<"/hospital/sign-in">) {
  return (
    <PortalSignIn
      kind="hospital"
      intro="For hospital owners, administrators and staff: appointments, patient messages and your hospital's details."
      searchParams={searchParams}
    />
  );
}
