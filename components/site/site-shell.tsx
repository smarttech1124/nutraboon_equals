import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth/next";
import { BrandLogo } from "./logo";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

type Width = "full" | "wide" | "narrow";

const MAIN: Record<Width, string> = {
  full: "flex flex-1 flex-col",
  wide: "mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-8 pb-16 sm:px-6",
  narrow: "mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-10 pb-16 sm:px-6",
};

/**
 * Header, main landmark and footer for every page of the main site
 * (ADR-070). `width` sets the main column: "full" for marketing pages that
 * lay out their own sections, "wide" for directories and portals, "narrow"
 * for sign-in forms. Synchronous, so static pages stay static.
 */
export function SiteFrame({
  children,
  width = "wide",
  signedIn,
}: {
  children: ReactNode;
  width?: Width;
  signedIn?: boolean;
}) {
  return (
    <>
      <SiteHeader
        logo={<BrandLogo className="h-9 w-auto sm:h-10" priority />}
        signedIn={signedIn}
      />
      <main id="main" tabIndex={-1} className={MAIN[width]}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

/** SiteFrame for dynamic pages: the header shows "Your account" to signed-in visitors. */
export async function SiteShell({
  children,
  width = "wide",
  session = false,
}: {
  children: ReactNode;
  width?: Width;
  /** Read the sign-in state. Makes the page dynamic. */
  session?: boolean;
}) {
  // Without `session`, the header asks /api/session itself.
  const signedIn = session ? (await currentUser("web")) !== null : undefined;
  return (
    <SiteFrame width={width} signedIn={signedIn}>
      {children}
    </SiteFrame>
  );
}
