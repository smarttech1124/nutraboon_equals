import { PortalShell } from "@/components/portal/portal-shell";

/** The vendor portal, its login and its registration (ADR-067), in the portal frame (ADR-089). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell kind="vendor">{children}</PortalShell>;
}
