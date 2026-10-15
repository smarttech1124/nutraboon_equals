import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessConversationView } from "@/components/hospitals/conversation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Card } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { NEEDS, isNeed } from "@/lib/hospitals/accessibility";
import { CATEGORY_LABEL } from "@/lib/hospitals/agent";
import { requireHospital } from "@/lib/hospitals/server";
import {
  claimConversationAction,
  closeConversationAction,
  staffReplyAction,
} from "../../../actions";

export const metadata: Metadata = { title: "Patient conversation — Hospital portal" };

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** One accessibility conversation, for staff (ADR-068). */
export default async function ConversationPage({ params }: PageProps<"/hospital/inbox/[id]">) {
  const { id } = await params;
  const { user, org, manager, departmentIds } = await requireHospital(`/hospital/inbox/${id}`);
  const prisma = getPrisma();
  const c = await prisma.accessConversation.findFirst({
    where: { id, organizationId: org.id },
    include: {
      patient: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 500 },
      appointment: { select: { startsAt: true, needs: true } },
    },
  });
  if (!c) notFound();
  if (
    !manager &&
    departmentIds.length > 0 &&
    c.departmentId &&
    !departmentIds.includes(c.departmentId)
  ) {
    notFound();
  }
  const [department, assignee] = await Promise.all([
    c.departmentId
      ? prisma.hospitalDepartment.findUnique({
          where: { id: c.departmentId },
          select: { name: true },
        })
      : null,
    c.assignedUserId
      ? prisma.user.findUnique({ where: { id: c.assignedUserId }, select: { name: true } })
      : null,
  ]);

  return (
    <>
      <p>
        <Link href="/hospital/inbox" className="text-sm font-semibold text-brand-text underline">
          ← All patient messages
        </Link>
      </p>
      <Card
        title={`Conversation with ${c.patient.name}`}
        actions={
          <span className="flex flex-wrap gap-2">
            {c.urgent && <Badge tone="error">Urgent</Badge>}
            {c.needsDoctor && <Badge tone="warning">Needs a doctor</Badge>}
            {!c.urgent && <Badge>{CATEGORY_LABEL[c.category] ?? c.category}</Badge>}
          </span>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          {c.urgent && (
            <Alert tone="error">
              The patient may need urgent help. The assistant told them to call 112 or go to the
              nearest emergency department. Reply as soon as you can.
            </Alert>
          )}
          {c.summary && (
            <p className="text-ink">
              <span className="font-semibold">Assistant&apos;s summary:</span> {c.summary}
            </p>
          )}
          <p className="text-muted">
            {department ? `${department.name} · ` : ""}
            Started {when.format(c.createdAt)}
            {c.appointment ? ` · Appointment ${when.format(c.appointment.startsAt)}` : ""}
          </p>
          {c.appointment && c.appointment.needs.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Access needs">
              {c.appointment.needs.filter(isNeed).map((n) => (
                <li key={n}>
                  <Badge tone="info">{NEEDS[n]}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ink">
            {c.status === "closed"
              ? "This conversation is closed."
              : assignee
                ? `Handled by ${c.assignedUserId === user.id ? "you" : assignee.name}.`
                : "Nobody is handling this yet."}
          </p>
          {c.status !== "closed" && (
            <div className="flex flex-wrap gap-2">
              {!c.assignedUserId && (
                <ActionForm
                  action={claimConversationAction.bind(null, c.id)}
                  submitLabel="I'll handle this"
                  className="flex flex-col gap-2"
                />
              )}
              <ActionForm
                action={closeConversationAction.bind(null, c.id)}
                submitLabel="Close conversation"
                variant="secondary"
                confirm="Close this conversation? It will be deleted 90 days after closing."
                className="flex flex-col gap-2"
              />
            </div>
          )}
        </div>
      </Card>
      <Card title="Messages">
        <AccessConversationView
          conversationId={c.id}
          viewer="staff"
          initialStatus={c.status}
          initialMessages={c.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            inputMode: m.inputMode,
            createdAt: m.createdAt.toISOString(),
          }))}
          sendAction={staffReplyAction.bind(null, c.id)}
        />
      </Card>
    </>
  );
}
