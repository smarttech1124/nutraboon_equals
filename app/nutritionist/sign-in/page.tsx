import type { Metadata } from "next";
import { PortalSignIn } from "@/components/portal/portal-sign-in";

export const metadata: Metadata = { title: "Log in — Nutritionist portal" };

/** The nutritionist portal's own login page (ADR-089). */
export default function SignInPage({ searchParams }: PageProps<"/nutritionist/sign-in">) {
  return (
    <PortalSignIn
      kind="nutritionist"
      intro="For nutritionists and dietitians: your profile, qualifications, availability and session requests."
      searchParams={searchParams}
    />
  );
}
