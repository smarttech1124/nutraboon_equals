import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/nutritionist/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { requireHospital } from "@/lib/hospitals/server";
import { lagosMidnight } from "@/lib/hospitals/slots";
import { submitHospitalAction } from "../actions";

export const metadata: Metadata = { title: "Hospital portal" };

const time = new Intl.DateTimeFormat("en-NG", { timeStyle: "short", timeZone: "Africa/Lagos" });

/** Dashboard: verification, today's appointments, conversations waiting, notifications (ADR-068). */
export default async function HospitalDashboard() {
  const { user, org, status, manager } = await requireHospital("/hospital");
  const prisma = getPrisma();
  const start = lagosMidnight(new Date());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [profile, today, waiting, notifications] = await Promise.all([
    prisma.hospitalProfile.findUniqueOrThrow({ where: { organizationId: org.id } }),
    prisma.hospitalAppointment.findMany({
      where: { organizationId: org.id, status: "booked", startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: "asc" },
      include: { department: { select: { name: true } }, patient: { select: { name: true } } },
    }),
    prisma.accessConversation.findMany({
      where: { organizationId: org.id, status: { not: "closed" }, assignedUserId: null },
      orderBy: [{ urgent: "desc" }, { updatedAt: "asc" }],
      take: 10,
      select: { id: true, urgent: true, needsDoctor: true, category: true, updatedAt: true },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <>
      {manager && status !== "verified" && (
        <Card title="Verification">
          <div className="flex flex-col gap-3 text-sm">
            {profile.reviewNote && (
              <Alert tone="warning">Reviewer&apos;s note: {profile.reviewNote}</Alert>
            )}
            {status === "draft" || status === "changes_requested" ? (
              <>
                <p className="text-ink">
                  Complete the{" "}
                  <Link
                    href="/hospital/profile"
                    className="font-semibold text-brand-text underline"
                  >
                    hospital details
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/hospital/departments"
                    className="font-semibold text-brand-text underline"
                  >
                    departments
                  </Link>
                  , then submit.
                </p>
                <ActionForm
                  action={submitHospitalAction}
                  submitLabel="Submit for verification"
                  pendingLabel="Submitting…"
                />
              </>
            ) : status === "submitted" ? (
              <p className="text-ink">Your hospital is being reviewed. We will let you know.</p>
            ) : (
              <Alert tone="error">
                {status === "rejected"
                  ? "Your hospital was not approved."
                  : "Your hospital is suspended."}
              </Alert>
            )}
          </div>
        </Card>
      )}

      <Card
        title="Waiting for a reply"
        description="Patient messages nobody has taken yet. Urgent ones first."
      >
        {waiting.length === 0 ? (
          <EmptyState title="Nothing waiting" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {waiting.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/hospital/inbox/${c.id}`}
                  className="font-semibold text-brand-text underline"
                >
                  {c.category === "urgent"
                    ? "Urgent message"
                    : c.needsDoctor
                      ? "Needs a doctor"
                      : "Patient message"}
                </Link>
                {c.urgent && <Badge tone="error">Urgent</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Today's appointments">
        {today.length === 0 ? (
          <EmptyState title="No appointments today" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {today.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink">
                  {time.format(a.startsAt)} · {a.patient.name}
                </span>
                <span className="text-muted">{a.department.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Notifications"
        actions={
          notifications.some((n) => !n.readAt) ? (
            <form action={markNotificationsReadAction}>
              <Button type="submit" variant="ghost">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {notifications.map((n) => (
              <li key={n.id} className={n.readAt ? "text-muted" : "text-ink"}>
                <p className="font-semibold">{n.title}</p>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
