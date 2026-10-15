import { SiteShell } from "@/components/site/site-shell";

/** Frame for the vendor portal and its sign-up page (ADR-067). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell session>{children}</SiteShell>;
}
