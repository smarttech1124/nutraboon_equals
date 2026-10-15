import type { Metadata } from "next";
import { SiteFrame } from "@/components/site/site-shell";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

/**
 * 404 inside the normal site frame (ADR-072), so the header still shows the
 * visitor's real sign-in state and every recovery link is an ordinary link.
 */
export default function NotFound() {
  return (
    <SiteFrame width="narrow">
      <div className="flex flex-col items-start gap-4 py-10">
        <p className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold tracking-[0.12em] text-gold-text uppercase">
          Error 404
        </p>
        <h1 className="font-display text-4xl font-bold text-ink">Page not found</h1>
        <p className="text-lg text-muted">
          We couldn&apos;t find that page. It may have moved, or the link may be mistyped.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/" size="lg">
            Go to the home page
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary" size="lg">
            About Nutraboom Equals
          </ButtonLink>
        </div>
        <p className="text-sm text-muted">
          You can also ask the assistant with the button at the bottom of the screen.
        </p>
      </div>
    </SiteFrame>
  );
}
