import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card, EmptyState, TextAreaField } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { requireNutritionist } from "@/lib/nutritionists/server";
import { SESSION_TYPE_LABEL } from "@/lib/nutritionists/specializations";
import { appointmentAction } from "../../actions";

export const metadata: Metadata = { title: "Appointments — Nutritionist portal" };

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

const STATUS = {
  requested: { label: "New request", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  canceled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "info" },
} as const;

/**
 * Session requests and history (ADR-064). Clients share only their name, email
 * and the note they chose to write; nothing from their chats.
 */
export default async function AppointmentsPage() {
  const { user } = await requireNutritionist("/nutritionist/appointments");
  const appointments = await getPrisma().appointment.findMany({
    where: { nutritionistId: user.id },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 100,
    include: { client: { select: { name: true, email: true } } },
  });
  const open = appointments.filter((a) => a.status === "requested" || a.status === "accepted");
  const past = appointments.filter((a) => a.status !== "requested" && a.status !== "accepted");

  const item = (a: (typeof appointments)[number]) => (
    <li key={a.id} className="flex flex-col gap-3 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">{a.client.name}</span>
        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
      </div>
      <p className="text-ink">
        {when.format(a.startsAt)} · {a.minutes} min · {SESSION_TYPE_LABEL[a.sessionType]}
      </p>
      {(a.status === "accepted" || a.status === "completed") && (
        <p className="text-muted">Client email: {a.client.email}</p>
      )}
      {a.clientNote && (
        <p className="rounded-md bg-subtle p-2 text-ink">
          <span className="font-medium">Their note:</span> {a.clientNote}
        </p>
      )}
      {a.recommendation && (
        <p className="text-ink">
          <span className="font-medium">Your note:</span> {a.recommendation}
        </p>
      )}
      {a.status === "requested" && (
        <div className="flex flex-wrap gap-2">
          <ActionForm
            action={appointmentAction}
            submitLabel="Accept"
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="intent" value="accept" />
          </ActionForm>
          <ActionForm
            action={appointmentAction}
            submitLabel="Decline"
            variant="secondary"
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="intent" value="decline" />
          </ActionForm>
        </div>
      )}
      {a.status === "accepted" && (
        <div className="flex flex-col gap-3">
          <ActionForm action={appointmentAction} submitLabel="Mark complete">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="intent" value="complete" />
            <TextAreaField
              id={`rec-${a.id}`}
              name="recommendation"
              label="Note for the client (optional)"
              hint="Shown on their account page. Up to 2000 characters."
              maxLength={2000}
            />
          </ActionForm>
          <ActionForm
            action={appointmentAction}
            submitLabel="Cancel session"
            variant="danger"
            confirm="Cancel this session? The client will be told."
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="intent" value="cancel" />
          </ActionForm>
        </div>
      )}
    </li>
  );

  return (
    <>
      <Card
        title="Requests and upcoming sessions"
        description="Times are Nigerian time (WAT). Fees are settled between you and the client."
      >
        {open.length === 0 ? (
          <EmptyState title="Nothing waiting" />
        ) : (
          <ul className="flex flex-col gap-3">{open.map(item)}</ul>
        )}
      </Card>
      <Card title="History">
        {past.length === 0 ? (
          <EmptyState title="No past sessions" />
        ) : (
          <ul className="flex flex-col gap-3">{past.map(item)}</ul>
        )}
      </Card>
    </>
  );
}
