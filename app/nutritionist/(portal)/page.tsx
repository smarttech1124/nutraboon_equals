import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Button, Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { missingForSubmission } from "@/lib/nutritionists/profile";
import { requireNutritionist } from "@/lib/nutritionists/server";
import { markNotificationsReadAction, submitForReviewAction } from "../actions";

export const metadata: Metadata = { title: "Nutritionist portal" };

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** Portal dashboard: status, next steps, upcoming sessions and notifications (ADR-064). */
export default async function DashboardPage() {
  const { user, status } = await requireNutritionist("/nutritionist");
  const prisma = getPrisma();
  const [profile, upcoming, requests, notifications, entitlements] = await Promise.all([
    prisma.nutritionistProfile.findUniqueOrThrow({
      where: { userId: user.id },
      include: { _count: { select: { qualifications: true, documents: true } } },
    }),
    prisma.appointment.findMany({
      where: { nutritionistId: user.id, status: "accepted", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.appointment.count({ where: { nutritionistId: user.id, status: "requested" } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    getEntitlementService().entitlementsFor({ userId: user.id }),
  ]);
  const missing = missingForSubmission({
    ...profile,
    qualificationCount: profile._count.qualifications,
    documentCount: profile._count.documents,
  });
  const listed = status === "verified" && entitlements["nutritionist.listing"];
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <Card title="Your profile">
        <div className="flex flex-col gap-3 text-sm">
          {status === "draft" || status === "changes_requested" ? (
            <>
              {status === "changes_requested" && profile.reviewNote && (
                <Alert tone="warning">Reviewer&apos;s note: {profile.reviewNote}</Alert>
              )}
              {missing.length > 0 ? (
                <>
                  <p className="text-ink">Before you can submit your profile:</p>
                  <ul className="list-disc space-y-1 pl-5 text-ink">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <ActionForm
                  action={submitForReviewAction}
                  submitLabel="Submit for review"
                  pendingLabel="Submitting…"
                >
                  <p className="text-ink">
                    Your profile is complete. Submit it for review; it stays hidden until a reviewer
                    approves it.
                  </p>
                </ActionForm>
              )}
            </>
          ) : status === "submitted" ? (
            <p className="text-ink">
              Your profile is being reviewed. We will let you know the outcome here and by email.
            </p>
          ) : status === "verified" ? (
            <p className="text-ink">
              Your profile is verified.{" "}
              {listed ? (
                <>People can find you in the nutritionist directory and in chat suggestions.</>
              ) : (
                <>
                  It is not listed yet: listing needs a plan.{" "}
                  <Link
                    href="/nutritionist/plan"
                    className="font-semibold text-brand-text underline"
                  >
                    See plans
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <Alert tone="error">
              {status === "rejected"
                ? "Your profile was not approved."
                : "Your profile is suspended and hidden."}
              {profile.reviewNote ? ` Reviewer's note: ${profile.reviewNote}` : ""} Contact support
              if you have questions.
            </Alert>
          )}
        </div>
      </Card>

      <Card
        title="Upcoming sessions"
        actions={
          requests > 0 ? (
            <Link
              href="/nutritionist/appointments"
              className="text-sm font-semibold text-brand-text underline"
            >
              {requests} new request{requests === 1 ? "" : "s"}
            </Link>
          ) : undefined
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming sessions" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink">{a.client.name}</span>
                <span className="text-muted">
                  {when.format(a.startsAt)} · {a.sessionType === "online" ? "Online" : "In person"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Notifications"
        actions={
          unread > 0 ? (
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
                <p className="font-semibold">
                  {!n.readAt && <span className="sr-only">Unread: </span>}
                  {n.title}
                </p>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
