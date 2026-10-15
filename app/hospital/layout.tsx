import { SiteShell } from "@/components/site/site-shell";

/** Frame for the hospital portal and its sign-up page (ADR-068). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell session>{children}</SiteShell>;
}
