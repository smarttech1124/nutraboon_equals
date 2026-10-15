import Link from "next/link";
import { contactEmail, socialLinks } from "@/lib/site";
import { Icon } from "./icons";
import { BrandLogo } from "./logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/", label: "Home" },
      { href: "/products", label: "Products" },
      { href: "/hospitals", label: "Find a hospital" },
      { href: "/nutritionists", label: "Find a nutritionist" },
      { href: "/planner", label: "Meal Planner" },
      { href: "/about", label: "About us" },
    ],
  },
  {
    title: "Partners",
    links: [
      { href: "/for-nutritionists", label: "For nutritionists" },
      { href: "/for-vendors", label: "For vendors" },
      { href: "/hospital/join", label: "Register a hospital" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
];

/** The public site's footer (ADR-070): links, contact, the health notice and legal links. */
export function SiteFooter() {
  const email = contactEmail();
  const social = socialLinks();
  return (
    <footer className="mt-auto bg-deep text-deep-ink print:hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <BrandLogo variant="full" tone="light" className="h-16 w-auto self-start" />
          <p className="text-sm leading-relaxed opacity-85">
            AI-powered nutrition for Nigerian families, with the nutritionists, hospitals and food
            businesses that support them.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="font-display text-lg font-semibold">{col.title}</h2>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="opacity-85 hover:underline hover:opacity-100">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <h2 className="font-display text-lg font-semibold">Get in touch</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {email && (
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <Icon name="mail" className="size-4 shrink-0" />
                  {email}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2 opacity-85">
              <Icon name="chat" className="mt-0.5 size-4 shrink-0" />
              <span>Questions about food? Ask the assistant on the home page, any time.</span>
            </li>
          </ul>
          {social.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Social media">
              {social.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center rounded-full border border-deep-ink/30 px-3 text-sm hover:bg-white/10"
                  >
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-deep-ink/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-6 pb-24 text-xs opacity-80 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl">
            General nutrition information, not medical advice. For pregnancy, young children or
            medical conditions, speak with a qualified health professional. In an emergency, call
            112. Prices shown are estimates.
          </p>
          <p className="flex shrink-0 gap-4">
            <span>© {new Date().getFullYear()} Nutraboom Equals</span>
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
