import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(account)/actions";
import { BrandLogo } from "@/components/site/logo";
import { currentUser } from "@/lib/auth/next";

/**
 * The frame for a partner portal (ADR-089): hospital, vendor or nutritionist.
 * It replaces the public site's header, so a partner sees only their portal:
 * no Products, Vendors or Nutritionists links, just the portal's name, a way
 * back to the public site, and Log out. Each portal's own menu (in its portal
 * layout) shows only the sections that role may use.
 */

export type PortalKind = "hospital" | "vendor" | "nutritionist";

export const PORTALS: Record<
  PortalKind,
  { name: string; home: string; signIn: string; join: string; joinLabel: string }
> = {
  hospital: {
    name: "Hospital portal",
    home: "/hospital",
    signIn: "/hospital/sign-in",
    join: "/hospital/join",
    joinLabel: "Register a hospital",
  },
  vendor: {
    name: "Vendor portal",
    home: "/vendor",
    signIn: "/vendor/sign-in",
    join: "/vendor/join",
    joinLabel: "Register a business",
  },
  nutritionist: {
    name: "Nutritionist portal",
    home: "/nutritionist",
    signIn: "/nutritionist/sign-in",
    join: "/nutritionist/join",
    joinLabel: "Apply as a nutritionist",
  },
};

export async function PortalShell({ kind, children }: { kind: PortalKind; children: ReactNode }) {
  const portal = PORTALS[kind];
  const user = await currentUser("web");
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <a
          href="#main"
          className="sr-only rounded-full bg-surface px-4 py-2 font-semibold text-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={user ? portal.home : portal.signIn}
            className="flex items-center gap-3 rounded-lg"
            aria-label={`Nutraboom Equals ${portal.name}`}
          >
            <BrandLogo className="h-9 w-auto" priority />
            <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-text">
              {portal.name}
            </span>
          </Link>
          <nav aria-label="Account" className="flex flex-wrap items-center gap-2 text-sm">
            {user ? (
              <>
                <span className="hidden text-muted sm:inline">{user.name}</span>
                <Link
                  href="/"
                  className="rounded-full px-3 py-2 font-medium text-ink hover:bg-subtle"
                >
                  Main site
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="min-h-10 rounded-full border border-line px-4 font-semibold text-ink hover:bg-subtle"
                  >
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href={portal.signIn}
                  className="rounded-full px-4 py-2 font-semibold text-ink hover:bg-subtle"
                >
                  Log in
                </Link>
                <Link
                  href={portal.join}
                  className="inline-flex min-h-10 items-center rounded-full bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
                >
                  {portal.joinLabel}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-8 pb-16 sm:px-6"
      >
        {children}
      </main>
      <footer className="border-t border-line py-6 text-sm text-muted print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <p>Nutraboom Equals · {portal.name}</p>
          <p className="flex gap-4">
            <Link href="/" className="underline underline-offset-2">
              Public site
            </Link>
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
