import { Badge } from "@/components/ui";
import { SectionNav } from "@/components/ui/section-nav";
import { STATUS_LABEL } from "@/lib/nutritionists/profile";
import { requireNutritionist } from "@/lib/nutritionists/server";

const SECTIONS = [
  { href: "/nutritionist", label: "Dashboard" },
  { href: "/nutritionist/profile", label: "Profile" },
  { href: "/nutritionist/qualifications", label: "Qualifications" },
  { href: "/nutritionist/availability", label: "Availability" },
  { href: "/nutritionist/appointments", label: "Appointments" },
  { href: "/nutritionist/plan", label: "Plan" },
];

/** The nutritionist portal (ADR-064): signed-in nutritionists only. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, status } = await requireNutritionist("/nutritionist");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Nutritionist portal</p>
          <p className="text-lg font-semibold text-ink">{user.name}</p>
        </div>
        <Badge
          tone={status === "verified" ? "success" : status === "submitted" ? "info" : "warning"}
        >
          {STATUS_LABEL[status] ?? status}
        </Badge>
      </div>
      <SectionNav items={SECTIONS} label="Nutritionist portal" root="/nutritionist" />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
