import { SiteShell } from "@/components/site/site-shell";

/** Frame for the nutritionist portal and its sign-up page (ADR-064). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell session>{children}</SiteShell>;
}
