import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessConversationView } from "@/components/hospitals/conversation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import {
  closeMyConversationAction,
  deleteConversationAction,
  patientMessageAction,
} from "../../actions";

export const metadata: Metadata = { title: "Your conversation" };

/** The patient's side of an accessibility conversation (ADR-068). */
export default async function PatientConversationPage({
  params,
}: PageProps<"/hospitals/messages/[id]">) {
  const { id } = await params;
  const user = await currentUser("web");
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/hospitals/messages/${id}`)}`);
  const c = await getPrisma().accessConversation.findFirst({
    where: { id, patientId: user.id },
    include: {
      organization: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 500 },
    },
  });
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-6">
      <p>
        <Link href="/account" className="text-sm font-semibold text-brand-text underline">
          ← Your account
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-ink">Conversation with {c.organization.name}</h1>
      {c.urgent && (
        <Alert tone="error">
          If you need urgent help, call 112 or go to the nearest emergency department now. Do not
          wait for a reply here.
        </Alert>
      )}
      <Card title="Messages">
        <AccessConversationView
          conversationId={c.id}
          viewer="patient"
          initialStatus={c.status}
          initialMessages={c.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            inputMode: m.inputMode,
            createdAt: m.createdAt.toISOString(),
          }))}
          sendAction={patientMessageAction.bind(null, c.id)}
        />
      </Card>
      <Card title="Your conversation">
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted">
            Closed conversations are deleted 90 days after closing. You can delete this one now.
          </p>
          <div className="flex flex-wrap gap-2">
            {c.status !== "closed" && (
              <ActionForm
                action={closeMyConversationAction.bind(null, c.id)}
                submitLabel="Close conversation"
                variant="secondary"
                className="flex flex-col gap-2"
              />
            )}
            <form action={deleteConversationAction.bind(null, c.id)}>
              <button
                type="submit"
                className="min-h-10 rounded-lg border border-danger px-4 text-sm font-semibold text-danger hover:bg-danger-soft"
              >
                Delete conversation now
              </button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
