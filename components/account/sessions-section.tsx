import Link from "next/link";
import { cancelMyAppointmentAction } from "@/app/nutritionists/[id]/actions";
import { formatFee } from "@/components/nutritionists/card";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Button, Card } from "@/components/ui";
import { markNotificationsReadAction } from "@/app/nutritionist/actions";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { SESSION_TYPE_LABEL } from "@/lib/nutritionists/specializations";

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

const STATUS = {
  requested: { label: "Waiting for reply", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  canceled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "info" },
} as const;

/** The account's nutritionist sessions and notifications (ADR-064). */
export async function SessionsSection({ user }: { user: AuthUser }) {
  if (!(await getEntitlementService().isEnabled("nutritionists"))) return null;
  const prisma = getPrisma();
  const [appointments, notifications, isNutritionist] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: user.id },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: {
        nutritionist: {
          select: {
            userId: true,
            contactEmail: true,
            contactPhone: true,
            whatsapp: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.nutritionistProfile.findUnique({ where: { userId: user.id }, select: { userId: true } }),
  ]);

  return (
    <>
      {notifications.length > 0 && (
        <Card
          title="Notifications"
          actions={
            <form action={markNotificationsReadAction}>
              <Button type="submit" variant="ghost">
                Mark all read
              </Button>
            </form>
          }
        >
          <ul className="flex flex-col gap-3 text-sm">
            {notifications.map((n) => (
              <li key={n.id}>
                <p className="font-semibold text-ink">{n.title}</p>
                <p className="text-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title="Nutritionist sessions"
        actions={
          <Link href="/nutritionists" className="text-sm font-semibold text-brand-text underline">
            Find a nutritionist
          </Link>
        }
      >
        {appointments.length === 0 ? (
          <p className="text-sm text-muted">You have not requested any sessions.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/nutritionists/${a.nutritionist.userId}`}
                    className="font-semibold text-ink underline"
                  >
                    {a.nutritionist.user.name}
                  </Link>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                </div>
                <p className="text-ink">
                  {when.format(a.startsAt)} · {SESSION_TYPE_LABEL[a.sessionType]} ·{" "}
                  {formatFee(a.feeMinor)}, paid to the nutritionist
                </p>
                {a.status === "accepted" && (
                  <p className="text-muted">
                    Contact:{" "}
                    {[
                      a.nutritionist.contactPhone,
                      a.nutritionist.whatsapp && `WhatsApp ${a.nutritionist.whatsapp}`,
                      a.nutritionist.contactEmail,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {a.recommendation && (
                  <p className="rounded-md bg-subtle p-2 whitespace-pre-line text-ink">
                    <span className="font-medium">Their note for you:</span> {a.recommendation}
                  </p>
                )}
                {(a.status === "requested" || a.status === "accepted") && (
                  <ActionForm
                    action={cancelMyAppointmentAction}
                    submitLabel="Cancel"
                    variant="secondary"
                    confirm="Cancel this session?"
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="id" value={a.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-muted">
        {isNutritionist ? (
          <Link href="/nutritionist" className="font-semibold text-brand-text underline">
            Open your nutritionist portal
          </Link>
        ) : (
          <>
            Are you a qualified nutritionist or dietitian?{" "}
            <Link href="/nutritionist/join" className="font-semibold text-brand-text underline">
              Join as a nutritionist
            </Link>
          </>
        )}
      </p>
    </>
  );
}
