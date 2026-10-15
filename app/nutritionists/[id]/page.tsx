import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatFee, NutritionistCardView, sessionTypesText } from "@/components/nutritionists/card";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, SelectField, TextAreaField } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { listedNutritionist } from "@/lib/nutritionists/directory";
import { SESSION_TYPE_LABEL } from "@/lib/nutritionists/specializations";
import { requestAppointmentAction } from "./actions";

export const metadata: Metadata = { title: "Nutritionist" };

/** A listed nutritionist's profile, contact details and session request form (ADR-064). */
export default async function NutritionistPage({ params }: PageProps<"/nutritionists/[id]">) {
  const { id } = await params;
  const card = await listedNutritionist(id);
  if (!card) notFound();
  const [user, profile] = await Promise.all([
    currentUser("web"),
    getPrisma().nutritionistProfile.findUnique({
      where: { userId: id },
      select: {
        bio: true,
        expertise: true,
        contactEmail: true,
        contactPhone: true,
        whatsapp: true,
      },
    }),
  ]);
  if (!profile) notFound();
  const whatsappDigits = profile.whatsapp?.replace(/\D/g, "");

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-4">
        <NutritionistCardView card={card} showLink={false} />
        <Link href="/nutritionists" className="text-sm font-medium text-brand-text underline">
          Back to all nutritionists
        </Link>
      </div>
      <div className="flex flex-col gap-6">
        {(profile.bio || profile.expertise.length > 0) && (
          <Card title="About">
            {profile.bio && <p className="text-sm whitespace-pre-line text-ink">{profile.bio}</p>}
            {profile.expertise.length > 0 && (
              <p className="mt-3 text-sm text-muted">Expertise: {profile.expertise.join(", ")}</p>
            )}
          </Card>
        )}
        <Card
          title="Contact"
          description={`Sessions cost ${formatFee(card.sessionFeeMinor)}. You pay the nutritionist directly, as you agree with them; Nutraboom Equals takes no payment.`}
        >
          {user ? (
            <ul className="flex flex-col gap-2 text-sm">
              {profile.contactPhone && (
                <li>
                  Phone:{" "}
                  <a
                    href={`tel:${profile.contactPhone.replace(/[^\d+]/g, "")}`}
                    className="font-semibold text-brand-text underline"
                  >
                    {profile.contactPhone}
                  </a>
                </li>
              )}
              {whatsappDigits && (
                <li>
                  WhatsApp:{" "}
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-brand-text underline"
                  >
                    {profile.whatsapp}
                    <span className="sr-only"> (opens WhatsApp)</span>
                  </a>
                </li>
              )}
              {profile.contactEmail && (
                <li>
                  Email:{" "}
                  <a
                    href={`mailto:${profile.contactEmail}`}
                    className="font-semibold text-brand-text underline"
                  >
                    {profile.contactEmail}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-ink">
              <Link
                href={`/sign-in?next=/nutritionists/${id}`}
                className="font-semibold text-brand-text underline"
              >
                Log in
              </Link>{" "}
              to see contact details and request a session.
            </p>
          )}
        </Card>
        {user && user.id !== id && (
          <Card
            title="Request a session"
            description={`${sessionTypesText(card.sessionTypes)}, ${card.sessionMinutes} minutes. Available ${card.availability.join(", ")} (Nigerian time).`}
          >
            <ActionForm
              action={requestAppointmentAction}
              submitLabel="Send request"
              pendingLabel="Sending…"
            >
              <input type="hidden" name="nutritionistId" value={id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="sessionType"
                  name="sessionType"
                  label="Session type"
                  defaultValue={card.sessionTypes[0]}
                >
                  {card.sessionTypes.map((t) => (
                    <option key={t} value={t}>
                      {SESSION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </SelectField>
                <Field
                  id="startsAt"
                  name="startsAt"
                  type="datetime-local"
                  label="Preferred date and time"
                  hint="Nigerian time (WAT)."
                  required
                />
              </div>
              <TextAreaField
                id="note"
                name="note"
                label="What would you like help with? (optional)"
                hint="Up to 500 characters. Share only what you are comfortable with."
                maxLength={500}
              />
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" name="consent" required className="mt-1" />
                <span>
                  Share my name, email and this note with the nutritionist so they can arrange the
                  session.
                </span>
              </label>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
