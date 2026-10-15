import { Badge } from "@/components/ui";
import { SectionNav } from "@/components/ui/section-nav";
import { STAFF_ROLE_LABEL, requireHospital } from "@/lib/hospitals/server";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";

/** The hospital portal (ADR-068). Managers see setup; all staff see the inbox and appointments. */
export default async function HospitalPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role, status, manager } = await requireHospital("/hospital");
  const sections = [
    { href: "/hospital", label: "Dashboard" },
    { href: "/hospital/inbox", label: "Patient messages" },
    { href: "/hospital/appointments", label: "Appointments" },
    ...(manager
      ? [
          { href: "/hospital/profile", label: "Hospital" },
          { href: "/hospital/departments", label: "Departments" },
          { href: "/hospital/staff", label: "Staff" },
          { href: "/hospital/plan", label: "Plan" },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            Hospital portal · {user.name}, {STAFF_ROLE_LABEL[role]}
          </p>
          <p className="text-lg font-semibold text-ink">{org.name}</p>
        </div>
        <Badge
          tone={status === "verified" ? "success" : status === "submitted" ? "info" : "warning"}
        >
          {REVIEW_STATUS_LABEL[status] ?? status}
        </Badge>
      </div>
      <SectionNav items={sections} label="Hospital portal" root="/hospital" />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
