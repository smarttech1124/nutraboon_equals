import Link from "next/link";
import { SiteShell } from "@/components/site/site-shell";

/** Frame for the standalone Meal Planner (ADR-066). */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell session>
      <nav aria-label="Meal Planner" className="mb-6 flex gap-4 text-sm font-medium print:hidden">
        <Link href="/planner" className="text-brand-text underline underline-offset-2">
          Meal Planner
        </Link>
        <Link href="/account" className="text-brand-text underline underline-offset-2">
          Your account
        </Link>
      </nav>
      {children}
    </SiteShell>
  );
}
