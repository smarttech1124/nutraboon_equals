import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card } from "@/components/ui";
import { cancelHospitalAppointmentAction } from "@/app/hospitals/actions";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/**
 * Hospital appointments and accessibility conversations on the account page,
 * plus entry to the hospital portal for staff (ADR-068).
 */
export async function HospitalsSection({ user }: { user: AuthUser }) {
  if (!(await getEntitlementService().isEnabled("hospitals"))) return null;
  const prisma = getPrisma();
  const [appointments, conversations, membership] = await Promise.all([
    prisma.hospitalAppointment.findMany({
      where: { patientId: user.id, status: "booked", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 10,
      include: {
        organization: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.accessConversation.findMany({
      where: { patientId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, status: true, updatedAt: true, organization: { select: { name: true } } },
    }),
    prisma.membership.findFirst({
      where: { userId: user.id, organization: { kind: "hospital" } },
      select: { organizationId: true },
    }),
  ]);

  return (
    <Card
      title="Hospitals"
      description="Find accessible hospitals, book appointments and message staff by text or voice."
    >
      <div className="flex flex-col gap-4 text-sm">
        {appointments.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">Upcoming appointments</h3>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {appointments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-ink">
                    {when.format(a.startsAt)} · {a.organization.name}, {a.department.name}
                  </span>
                  <ActionForm
                    action={cancelHospitalAppointmentAction.bind(null, a.id)}
                    submitLabel="Cancel"
                    variant="secondary"
                    confirm="Cancel this appointment?"
                    className="flex flex-col gap-2"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        {conversations.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">Your conversations</h3>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {conversations.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link
                    href={`/hospitals/messages/${c.id}`}
                    className="font-semibold text-brand-text underline"
                  >
                    {c.organization.name}
                  </Link>
                  <span className="flex items-center gap-2 text-muted">
                    {when.format(c.updatedAt)}
                    {c.status === "closed" ? (
                      <Badge>Closed</Badge>
                    ) : (
                      <Badge tone="info">Open</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/hospitals" className="font-semibold text-brand-text underline">
            Find a hospital
          </Link>
          {membership ? (
            <Link href="/hospital" className="font-semibold text-brand-text underline">
              Open the hospital portal
            </Link>
          ) : (
            <Link href="/hospital/join" className="text-muted underline">
              Register your hospital
            </Link>
          )}
        </p>
      </div>
    </Card>
  );
}
