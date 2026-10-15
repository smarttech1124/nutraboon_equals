import Link from "next/link";
import { AdminLogo } from "@admin/components/logo";
import { SectionNav, type NavItem } from "@/components/ui/section-nav";
import { adminAccess } from "@admin/lib/access";
import { Button } from "@/components/ui";
import { can, ROLE_LABEL, type Permission } from "@/lib/auth/permissions";
import { signOutAction } from "../sign-in/actions";

/** Each section and the permission that shows it (ADR-061). Pages check again. */
const SECTIONS: (NavItem & { permission?: Permission })[] = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Platform users", permission: "users.read" },
  { href: "/admins", label: "Administrators", permission: "users.read" },
  { href: "/nutritionists", label: "Nutritionists", permission: "nutritionists.verify" },
  { href: "/vendors", label: "Vendors", permission: "vendors.verify" },
  { href: "/hospitals", label: "Hospitals", permission: "hospitals.verify" },
  { href: "/plans", label: "Plans", permission: "plans.read" },
  { href: "/subscriptions", label: "Subscriptions", permission: "subscriptions.read" },
  { href: "/ai", label: "AI providers", permission: "ai.manage" },
  { href: "/audio", label: "Audio", permission: "audio.manage" },
  { href: "/settings", label: "Settings", permission: "settings.manage" },
  { href: "/audit", label: "Audit log", permission: "audit.read" },
  { href: "/profile", label: "My profile" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await adminAccess();
  if (!access.ok) return null; // unreachable: no permission is required here
  const { user } = access;
  const items = SECTIONS.filter((s) => !s.permission || can(user.adminRoles, s.permission));

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex flex-col gap-4 p-4">
          <Link href="/" className="flex flex-col gap-1 rounded-lg">
            <AdminLogo />
            <span className="text-xs text-muted">n-equals administration</span>
          </Link>
          <SectionNav items={items} label="n-equals" vertical />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-line bg-surface px-4 py-2 text-sm">
          <Link href="/profile" className="text-muted hover:text-ink hover:underline">
            {user.name} · {user.adminRoles.map((r) => ROLE_LABEL[r]).join(", ")}
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
