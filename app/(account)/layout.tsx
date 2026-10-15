import { SiteShell } from "@/components/site/site-shell";

/** Frame for sign-in pages and the account dashboard (ADR-061, ADR-070). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell session width="full">
      {children}
    </SiteShell>
  );
}
