"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/** Section links for a portal (n-equals, the nutritionist portal). Callers pass only allowed sections. */
export function SectionNav({
  items,
  label,
  root = "/",
  vertical = false,
}: {
  items: NavItem[];
  label: string;
  root?: string;
  /** Stacks the links on wide screens (sidebars). */
  vertical?: boolean;
}) {
  const path = usePathname();
  return (
    <nav
      aria-label={label}
      className={`flex gap-1 overflow-x-auto ${vertical ? "md:flex-col" : "border-b border-line pb-2"}`}
    >
      {items.map((item) => {
        const active = item.href === root ? path === root : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
              active ? "bg-brand-soft text-brand-text" : "text-ink hover:bg-subtle"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
