"use client"; // Error boundaries must be Client Components

import { BrandLogo } from "@/components/site/logo";
import { SiteHeader } from "@/components/site/site-header";

/**
 * Shown if rendering the page fails. The error's details are never shown
 * (CLAUDE.md §27); in production Next.js replaces server error messages
 * with a digest anyway. The header keeps navigation and the visitor's
 * sign-in state (ADR-072).
 */
export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <>
      <SiteHeader logo={<BrandLogo className="h-9 w-auto sm:h-10" />} />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16"
      >
        <h1 className="font-display text-4xl font-bold text-ink">Something went wrong</h1>
        <p role="alert" className="text-lg text-muted">
          Sorry, the page didn&apos;t load properly. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-strong"
        >
          Try again
        </button>
      </main>
    </>
  );
}
