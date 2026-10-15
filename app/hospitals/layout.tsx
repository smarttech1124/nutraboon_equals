import { SiteShell } from "@/components/site/site-shell";

/** Frame for the public hospital directory and patient conversations (ADR-068). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell session>{children}</SiteShell>;
}
