import { redirect } from "next/navigation";
import { SectionNav } from "@/components/ui/section-nav";
import { currentUser } from "@/lib/auth/next";

const SECTIONS = [
  { href: "/account", label: "Overview" },
  { href: "/account/meal-plans", label: "Meal plans" },
  { href: "/account/nutritionists", label: "Meet a nutritionist" },
  { href: "/account/plan", label: "Change plan" },
  { href: "/account/profile", label: "Manage profile" },
];

/**
 * The account dashboard (ADR-075). Signed-in users only; every page and
 * action below checks the session again on the server.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-6">
      <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold tracking-wide text-muted uppercase">Your account</p>
          <SectionNav items={SECTIONS} label="Your account" root="/account" vertical />
        </div>
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
