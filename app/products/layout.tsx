import { SiteShell } from "@/components/site/site-shell";

/** Frame for the product directory (ADR-067). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell session>{children}</SiteShell>;
}
