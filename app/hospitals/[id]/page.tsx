import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MessageComposer } from "@/components/hospitals/composer";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Card, CheckboxGroup, TextAreaField } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { ACCESS_SERVICES, isAccessService, NEEDS } from "@/lib/hospitals/accessibility";
import { isListedHospital } from "@/lib/hospitals/directory";
import { fromLagosDateKey, openDates, slotsForDay } from "@/lib/hospitals/slots";
import { describeAvailability, parseAvailability } from "@/lib/nutritionists/availability";
import { bookAppointmentAction, startConversationAction } from "../actions";

export const metadata: Metadata = { title: "Hospital" };

const DAY_MS = 24 * 60 * 60 * 1000;
const dayLabel = new Intl.DateTimeFormat("en-NG", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Lagos",
});
const timeLabel = new Intl.DateTimeFormat("en-NG", {
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** A hospital's page: details, booking and messaging (ADR-068). */
export default async function HospitalPage({ params, searchParams }: PageProps<"/hospitals/[id]">) {
  await connection();
  const { id } = await params;
  if (!(await isListedHospital(id))) notFound();
  const query = await searchParams;
  const prisma = getPrisma();
  const [profile, user] = await Promise.all([
    prisma.hospitalProfile.findUniqueOrThrow({
      where: { organizationId: id },
      include: {
        organization: {
          select: {
            name: true,
            departments: { where: { active: true }, orderBy: { name: "asc" } },
          },
        },
      },
    }),
    currentUser("web"),
  ]);
  const departments = profile.organization.departments;
  // Access needs saved in the profile are ticked for the booking (ADR-075).
  const savedNeeds = user
    ? ((
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { accessibilityNeeds: true },
        })
      )?.accessibilityNeeds ?? [])
    : [];
  const name = profile.organization.name;
  const now = new Date();

  // Booking is chosen step by step with links, so it works without JavaScript.
  const department = departments.find((d) => d.id === str(query.department));
  const dates = department ? openDates(department.availability, now) : [];
  const dateKey = dates.includes(str(query.date)) ? str(query.date) : "";
  const date = dateKey ? fromLagosDateKey(dateKey) : null;
  let slots: Date[] = [];
  if (department && date) {
    const booked = await prisma.hospitalAppointment.findMany({
      where: {
        departmentId: department.id,
        status: "booked",
        startsAt: { gte: date, lt: new Date(date.getTime() + DAY_MS) },
      },
      select: { startsAt: true },
    });
    slots = slotsForDay(
      date,
      department.availability,
      department.slotMinutes,
      department.capacity,
      booked.map((b) => b.startsAt),
      now,
    );
  }
  const signIn = `/sign-in?next=${encodeURIComponent(`/hospitals/${id}`)}`;
  const pill =
    "inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle";
  const pillOn =
    "inline-flex min-h-10 items-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white";

  return (
    <div className="flex flex-col gap-6">
      <p>
        <Link href="/hospitals" className="text-sm font-semibold text-brand-text underline">
          ← Find another hospital
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-bold text-ink">{name}</h1>
        <p className="mt-1 text-muted">
          {[profile.address, profile.area, profile.city, profile.state].filter(Boolean).join(", ")}
        </p>
      </div>
      <Alert tone="warning">
        In an emergency, call 112{profile.emergencyPhone ? ` or ${profile.emergencyPhone}` : ""}, or
        go to the nearest emergency department now. Messages here are not for emergencies.
      </Alert>

      <Card title="About">
        <div className="flex flex-col gap-3 text-sm text-ink">
          {profile.description && <p className="whitespace-pre-wrap">{profile.description}</p>}
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
            {profile.phone && (
              <>
                <dt className="text-muted">Phone</dt>
                <dd>
                  <a href={`tel:${profile.phone}`} className="underline">
                    {profile.phone}
                  </a>
                </dd>
              </>
            )}
            {profile.email && (
              <>
                <dt className="text-muted">Email</dt>
                <dd>
                  <a href={`mailto:${profile.email}`} className="underline">
                    {profile.email}
                  </a>
                </dd>
              </>
            )}
            {profile.website && (
              <>
                <dt className="text-muted">Website</dt>
                <dd>
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {profile.website}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              </>
            )}
          </dl>
          {profile.latitude !== null && profile.longitude !== null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${profile.latitude}&mlon=${profile.longitude}#map=17/${profile.latitude}/${profile.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-text underline"
            >
              Open the map<span className="sr-only"> (OpenStreetMap, opens in a new tab)</span>
            </a>
          )}
          {profile.accessibility.length > 0 && (
            <div>
              <h2 className="font-semibold">Accessibility</h2>
              <ul className="mt-1 list-disc pl-5">
                {profile.accessibility.filter(isAccessService).map((a) => (
                  <li key={a}>{ACCESS_SERVICES[a]}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card title="Book an appointment" description="Times are Nigerian time.">
        {departments.length === 0 ? (
          <p className="text-sm text-muted">This hospital has no bookable departments yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <nav aria-label="Department">
              <p className="mb-2 text-sm font-medium text-ink">1. Department</p>
              <ul className="flex flex-wrap gap-2">
                {departments.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/hospitals/${id}?department=${d.id}#book`}
                      className={d.id === department?.id ? pillOn : pill}
                      aria-current={d.id === department?.id ? "true" : undefined}
                    >
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {department && (
              <>
                {department.description && (
                  <p className="text-sm text-muted">{department.description}</p>
                )}
                <p className="text-sm text-muted">
                  Open {describeAvailability(parseAvailability(department.availability)).join(", ")}
                </p>
                <nav aria-label="Date" id="book">
                  <p className="mb-2 text-sm font-medium text-ink">2. Day</p>
                  {dates.length === 0 ? (
                    <p className="text-sm text-muted">No opening days in the next weeks.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {dates.map((k) => (
                        <li key={k}>
                          <Link
                            href={`/hospitals/${id}?department=${department.id}&date=${k}#book`}
                            className={k === dateKey ? pillOn : pill}
                            aria-current={k === dateKey ? "true" : undefined}
                          >
                            {dayLabel.format(fromLagosDateKey(k)!.getTime() + 12 * 60 * 60 * 1000)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </nav>
              </>
            )}
            {department && date && (
              <div>
                <p className="mb-2 text-sm font-medium text-ink">3. Time and your needs</p>
                {slots.length === 0 ? (
                  <p className="text-sm text-muted">No free times that day. Choose another day.</p>
                ) : !user ? (
                  <p className="text-sm text-ink">
                    <Link href={signIn} className="font-semibold text-brand-text underline">
                      Log in
                    </Link>{" "}
                    to book.
                  </p>
                ) : (
                  <ActionForm
                    action={bookAppointmentAction.bind(null, id)}
                    submitLabel="Book appointment"
                    pendingLabel="Booking…"
                  >
                    <input type="hidden" name="departmentId" value={department.id} />
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-sm font-medium text-ink">Time</legend>
                      <div className="flex flex-wrap gap-2">
                        {slots.map((s, i) => (
                          <label
                            key={s.toISOString()}
                            className={`${pill} cursor-pointer gap-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft`}
                          >
                            <input
                              type="radio"
                              name="startsAt"
                              value={s.toISOString()}
                              required
                              defaultChecked={i === 0}
                            />
                            {timeLabel.format(s)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <CheckboxGroup
                      legend="What would help you? (optional)"
                      name="needs"
                      options={Object.entries(NEEDS).map(([value, label]) => ({ value, label }))}
                      selected={savedNeeds}
                    />
                    <TextAreaField
                      id="note"
                      name="note"
                      label="Anything else the hospital should know? (optional)"
                      maxLength={500}
                    />
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input type="checkbox" name="consent" required className="mt-1 size-4" />I
                      agree to share my name, email, and the needs above with {name} for this
                      appointment.
                    </label>
                  </ActionForm>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Message the hospital"
        description="Type or speak your question. Our assistant passes it to the right staff, and their replies appear in the conversation."
      >
        {user ? (
          <div className="flex flex-col gap-3">
            <MessageComposer
              id="first-message"
              label="Your message"
              sendAction={startConversationAction.bind(null, id)}
              allowSpeech
              submitLabel="Send to the hospital"
            />
            <p className="text-xs text-muted">
              Your conversation is shared with the hospital&apos;s staff. It is deleted 90 days
              after it is closed, and you can delete it at any time.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink">
            <Link href={signIn} className="font-semibold text-brand-text underline">
              Log in
            </Link>{" "}
            to message {name}.
          </p>
        )}
      </Card>
    </div>
  );
}
