import { PortalShell } from "@/components/portal/portal-shell";

/** The nutritionist portal, its login and its registration (ADR-064), in the portal frame (ADR-089). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell kind="nutritionist">{children}</PortalShell>;
}
