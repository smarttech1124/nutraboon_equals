import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResendVerificationForm } from "@/components/account/forms";
import { HospitalsSection } from "@/components/account/hospitals-section";
import { SessionsSection } from "@/components/account/sessions-section";
import { VendorLink } from "@/components/account/vendor-link";
import { AskAssistantButton } from "@/components/chat/AskAssistantButton";
import { Icon, type IconName } from "@/components/site/icons";
import { Badge, Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { resendVerificationAction } from "../actions";

export const metadata: Metadata = { title: "Your account" };

const TILE =
  "flex min-h-28 flex-col justify-between gap-3 rounded-3xl border border-line bg-surface p-5 text-left transition hover:border-brand hover:shadow-md";

function Tile({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className={TILE}>
      <Icon name={icon} className="size-7 text-brand-text" />
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </Link>
  );
}

/** Account overview (ADR-075): who you are, your plan, and quick actions. */
export default async function AccountOverview() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account");
  const prisma = getPrisma();
  const service = getEntitlementService();
  const [
    flags,
    subscriptions,
    planCount,
    upcomingSessions,
    upcomingHospital,
    conversation,
    hospitalMember,
  ] = await Promise.all([
    service.featureFlags(),
    prisma.subscription.findMany({
      where: { userId: user.id, status: { in: ["active", "past_due"] } },
      select: { status: true, plan: { select: { name: true } } },
    }),
    prisma.mealPlan.count({ where: { userId: user.id } }),
    prisma.appointment.count({
      where: {
        clientId: user.id,
        status: { in: ["requested", "accepted"] },
        startsAt: { gte: new Date() },
      },
    }),
    prisma.hospitalAppointment.count({
      where: { patientId: user.id, status: "booked", startsAt: { gte: new Date() } },
    }),
    // The conversation to resume: the latest one still open with a hospital (ADR-089).
    prisma.accessConversation.findFirst({
      where: { patientId: user.id, status: { in: ["open", "escalated"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true, organization: { select: { name: true } } },
    }),
    prisma.membership.findFirst({
      where: { userId: user.id, organization: { kind: "hospital" } },
      select: { organization: { select: { name: true } } },
    }),
  ]);
  const updated = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
  const firstName = user.name.split(/\s+/)[0];
  const planName = subscriptions.map((s) => s.plan.name).join(", ") || "Free plan";

  return (
    <>
      <section
        aria-labelledby="welcome-title"
        className="rounded-3xl bg-deep p-6 text-deep-ink sm:p-8"
      >
        <h1 id="welcome-title" className="font-display text-3xl font-bold sm:text-4xl">
          Welcome, {firstName}
        </h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="opacity-80">Email</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium break-all">
              {user.email}
              {user.emailVerified ? (
                <Badge tone="success">Confirmed</Badge>
              ) : (
                <Badge tone="warning">Not confirmed</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="opacity-80">Plan</dt>
            <dd className="font-medium">
              {planName}{" "}
              {subscriptions.some((s) => s.status === "past_due") && (
                <Badge tone="warning">Payment due</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="opacity-80">Coming up</dt>
            <dd className="font-medium">
              {upcomingSessions + upcomingHospital === 0
                ? "No appointments"
                : `${upcomingSessions + upcomingHospital} appointment${upcomingSessions + upcomingHospital === 1 ? "" : "s"}`}
            </dd>
          </div>
        </dl>
      </section>

      {!user.emailVerified && (
        <Card
          title="Confirm your email"
          description="Confirming lets you subscribe and receive booking emails."
        >
          <ResendVerificationForm action={resendVerificationAction} />
        </Card>
      )}

      <section aria-labelledby="quick-title">
        <h2 id="quick-title" className="mb-3 font-display text-2xl font-semibold text-ink">
          What would you like to do?
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li>
            <AskAssistantButton className={`${TILE} w-full`}>
              <Icon name="chat" className="size-7 text-brand-text" />
              <span>
                <span className="block font-semibold text-ink">Ask the assistant</span>
                <span className="mt-0.5 block text-sm text-muted">
                  Food questions, meal ideas, budgets
                </span>
              </span>
            </AskAssistantButton>
          </li>
          {flags.mealPlanner && (
            <li>
              <Tile
                href="/account/meal-plans"
                icon="calendar"
                title="Meal plans"
                text={
                  planCount === 0
                    ? "Create your first plan"
                    : `${planCount} saved plan${planCount === 1 ? "" : "s"}`
                }
              />
            </li>
          )}
          {flags.nutritionists && (
            <li>
              <Tile
                href="/account/nutritionists"
                icon="stethoscope"
                title="Meet a nutritionist"
                text="Verified professionals and your requests"
              />
            </li>
          )}
          {conversation && (
            <li>
              <Tile
                href={`/hospitals/messages/${conversation.id}`}
                icon="chat"
                title="Continue your hospital conversation"
                text={`${conversation.organization.name} · updated ${updated.format(conversation.updatedAt)}`}
              />
            </li>
          )}
          {hospitalMember && (
            <li>
              <Tile
                href="/hospital"
                icon="hospital"
                title="Hospital portal"
                text={`Work for ${hospitalMember.organization.name}`}
              />
            </li>
          )}
          {flags.hospitals && (
            <li>
              <Tile
                href="/hospitals"
                icon="hospital"
                title="Find a hospital"
                text="Book and message accessible hospitals"
              />
            </li>
          )}
          {flags.vendors && (
            <li>
              <Tile
                href="/products"
                icon="basket"
                title="Food products"
                text="Verified products from Nigerian businesses"
              />
            </li>
          )}
          <li>
            <Tile
              href="/account/profile"
              icon="users"
              title="Manage profile"
              text="Your details, access needs and password"
            />
          </li>
        </ul>
      </section>

      <SessionsSection user={user} />
      <HospitalsSection user={user} />
      <VendorLink user={user} />
    </>
  );
}
