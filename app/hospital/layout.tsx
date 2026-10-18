import { PortalShell } from "@/components/portal/portal-shell";

/** The hospital portal, its login and its registration (ADR-068), in the portal frame (ADR-089). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell kind="hospital">{children}</PortalShell>;
}
