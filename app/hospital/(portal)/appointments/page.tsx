import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { NEEDS, isNeed } from "@/lib/hospitals/accessibility";
import { requireHospital } from "@/lib/hospitals/server";
import { appointmentStatusAction } from "../../actions";

export const metadata: Metadata = { title: "Appointments — Hospital portal" };

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  canceled: "Cancelled",
  attended: "Attended",
  no_show: "Did not come",
};

/**
 * Appointments booked through Nutraboom Equals, with each patient's stated
 * access needs so staff can prepare (ADR-068). Staff limited to departments
 * see only those departments.
 */
export default async function AppointmentsPage() {
  const { org, manager, departmentIds } = await requireHospital("/hospital/appointments");
  const scope = !manager && departmentIds.length > 0 ? { departmentId: { in: departmentIds } } : {};
  const now = new Date();
  const prisma = getPrisma();
  const include = {
    department: { select: { name: true } },
    patient: { select: { name: true } },
  } as const;
  const [upcoming, past] = await Promise.all([
    prisma.hospitalAppointment.findMany({
      where: {
        organizationId: org.id,
        ...scope,
        status: "booked",
        startsAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
      include,
    }),
    prisma.hospitalAppointment.findMany({
      where: {
        organizationId: org.id,
        ...scope,
        OR: [
          { status: { not: "booked" } },
          { startsAt: { lt: new Date(now.getTime() - 12 * 60 * 60 * 1000) } },
        ],
      },
      orderBy: { startsAt: "desc" },
      take: 30,
      include,
    }),
  ]);

  return (
    <>
      <Card title="Upcoming appointments" description="Times are Nigerian time.">
        {upcoming.length === 0 ? (
          <EmptyState title="No appointments booked">
            Bookings from patients appear here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">
                    {when.format(a.startsAt)} · {a.department.name}
                  </p>
                  <span className="text-muted">{a.minutes} minutes</span>
                </div>
                <p className="text-ink">{a.patient.name}</p>
                {a.needs.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Access needs">
                    {a.needs.filter(isNeed).map((n) => (
                      <li key={n}>
                        <Badge tone="info">{NEEDS[n]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {a.note && <p className="text-muted">Note from the patient: {a.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <ActionForm
                    action={appointmentStatusAction.bind(null, a.id, "attended")}
                    submitLabel="Attended"
                    variant="secondary"
                    className="flex flex-col gap-2"
                  />
                  <ActionForm
                    action={appointmentStatusAction.bind(null, a.id, "no_show")}
                    submitLabel="Did not come"
                    variant="secondary"
                    className="flex flex-col gap-2"
                  />
                  <ActionForm
                    action={appointmentStatusAction.bind(null, a.id, "canceled")}
                    submitLabel="Cancel"
                    variant="danger"
                    confirm="Cancel this appointment? The patient will be told."
                    className="flex flex-col gap-2"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {past.length > 0 && (
        <Card title="Past and cancelled">
          <ul className="flex flex-col divide-y divide-line text-sm">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">
                  {when.format(a.startsAt)} · {a.department.name} · {a.patient.name}
                </span>
                <Badge>{STATUS_LABEL[a.status] ?? a.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
