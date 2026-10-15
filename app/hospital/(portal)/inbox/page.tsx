import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/hospitals/agent";
import { requireHospital } from "@/lib/hospitals/server";

export const metadata: Metadata = { title: "Patient messages — Hospital portal" };

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** Accessibility conversations: urgent first, then the longest waiting (ADR-068). */
export default async function InboxPage() {
  const { user, org, manager, departmentIds } = await requireHospital("/hospital/inbox");
  const scope =
    !manager && departmentIds.length > 0
      ? { OR: [{ departmentId: null }, { departmentId: { in: departmentIds } }] }
      : {};
  const prisma = getPrisma();
  const departments = await prisma.hospitalDepartment.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true },
  });
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const conversations = await prisma.accessConversation.findMany({
    where: { organizationId: org.id, ...scope },
    orderBy: [{ status: "asc" }, { urgent: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      category: true,
      summary: true,
      urgent: true,
      needsDoctor: true,
      assignedUserId: true,
      updatedAt: true,
      departmentId: true,
      patient: { select: { name: true } },
    },
  });

  return (
    <Card
      title="Patient messages"
      description="Patients who are deaf, hard of hearing, blind or speech-impaired can reach you here by text or voice. Closed conversations are deleted 90 days after closing."
    >
      {conversations.length === 0 ? (
        <EmptyState title="No messages yet">New messages from patients appear here.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {conversations.map((c) => (
            <li key={c.id} className="py-3">
              <Link
                href={`/hospital/inbox/${c.id}`}
                className="flex flex-col gap-1 rounded-lg p-1 hover:bg-subtle"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{c.patient.name}</span>
                  {c.urgent && <Badge tone="error">Urgent</Badge>}
                  {c.needsDoctor && <Badge tone="warning">Needs a doctor</Badge>}
                  {!c.urgent && <Badge>{CATEGORY_LABEL[c.category] ?? c.category}</Badge>}
                  {c.status === "closed" ? (
                    <Badge>Closed</Badge>
                  ) : c.assignedUserId === user.id ? (
                    <Badge tone="info">Yours</Badge>
                  ) : c.assignedUserId ? (
                    <Badge tone="info">Being handled</Badge>
                  ) : (
                    <Badge tone="warning">Waiting</Badge>
                  )}
                </span>
                {c.summary && <span className="text-ink">{c.summary}</span>}
                <span className="text-muted">
                  {c.departmentId && deptName.has(c.departmentId)
                    ? `${deptName.get(c.departmentId)} · `
                    : ""}
                  {when.format(c.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
