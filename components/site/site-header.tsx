"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { useSessionStatus } from "./use-session";

/**
 * The public site's header (ADR-070): logo, the main navigation and the
 * account links. On small screens the links fold into a menu button.
 * Dynamic pages pass `signedIn` from the server; on static pages the header
 * asks /api/session (useSessionStatus), and shows no account links until it
 * knows, so a signed-in visitor never sees "Log in" (ADR-072).
 */

export const NAV: { href: string; label: string; match: string[] }[] = [
  { href: "/", label: "Home", match: [] },
  { href: "/products", label: "Products", match: ["/products"] },
  { href: "/hospitals", label: "Hospitals", match: ["/hospitals", "/hospital"] },
  {
    href: "/for-nutritionists",
    label: "Nutritionists",
    match: ["/for-nutritionists", "/nutritionist"],
  },
  { href: "/for-vendors", label: "Vendors", match: ["/for-vendors", "/vendor"] },
  { href: "/about", label: "About us", match: ["/about"] },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  if (item.href === "/") return pathname === "/";
  // "/nutritionist" also covers "/nutritionists" and the portal.
  return item.match.some((m) => pathname === m || pathname.startsWith(m));
}

export function SiteHeader({ logo, signedIn }: { logo: ReactNode; signedIn?: boolean }) {
  const pathname = usePathname() ?? "/";
  const status = useSessionStatus(signedIn);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // Close the menu on navigation and with Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 print:hidden">
      <a
        href="#main"
        className="sr-only rounded-full bg-surface px-4 py-2 font-semibold text-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl rounded-3xl border border-line bg-surface/95 shadow-[0_8px_30px_-12px_rgba(38,70,83,0.25)] backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <Link href="/" aria-label="Nutraboom Equals home" className="shrink-0 rounded-lg">
            {logo}
          </Link>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                        active ? "bg-brand text-white" : "text-ink hover:bg-subtle"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            {status === "unknown" ? (
              <span aria-hidden="true" className="hidden h-10 w-44 sm:inline-block" />
            ) : status === "signedIn" ? (
              <Link
                href="/account"
                className="hidden min-h-10 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong sm:inline-flex"
              >
                Your account
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle sm:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  className="hidden min-h-10 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong sm:inline-flex"
                >
                  Sign up
                </Link>
              </>
            )}
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-subtle lg:hidden"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? "close" : "menu"} className="size-6" />
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            </button>
          </div>
        </div>
        <nav
          id={menuId}
          aria-label="Main"
          hidden={!open}
          className="border-t border-line px-3 pt-2 pb-4 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-2xl px-4 text-base font-medium ${
                      active ? "bg-brand text-white" : "text-ink hover:bg-subtle"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {status === "unknown" ? null : status === "signedIn" ? (
            <Link
              href="/account"
              className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-brand font-semibold text-white sm:hidden"
            >
              Your account
            </Link>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
              <Link
                href="/sign-in"
                className="flex min-h-11 items-center justify-center rounded-full border border-line font-semibold text-ink"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="flex min-h-11 items-center justify-center rounded-full bg-brand font-semibold text-white"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
