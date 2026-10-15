import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CheckboxGroup, Field, SelectField, TextAreaField } from "@/components/ui";
import { STATES } from "@/lib/budget/regions";
import { getPrisma } from "@/lib/db";
import { canEdit } from "@/lib/nutritionists/profile";
import { requireNutritionist } from "@/lib/nutritionists/server";
import {
  SESSION_TYPE_LABEL,
  SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
} from "@/lib/nutritionists/specializations";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { saveProfileAction, uploadPhotoAction } from "../../actions";

export const metadata: Metadata = { title: "Profile — Nutritionist portal" };

/** Professional profile and photo (ADR-064). */
export default async function ProfilePage() {
  const { user, status } = await requireNutritionist("/nutritionist/profile");
  const p = await getPrisma().nutritionistProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const editable = canEdit(status);

  return (
    <>
      <Card
        title="Professional profile"
        description={
          status === "verified"
            ? "Changing your title, specialisations or experience sends your profile back for review."
            : "This is what people see once your profile is verified."
        }
      >
        {!editable ? (
          <p className="text-sm text-muted">
            Your profile is being reviewed. You can edit it afterwards.
          </p>
        ) : (
          <ActionForm action={saveProfileAction} submitLabel="Save profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="title"
                name="title"
                label="Professional title"
                placeholder="e.g. Registered Dietitian"
                defaultValue={p.title}
                required
              />
              <Field
                id="yearsExperience"
                name="yearsExperience"
                type="number"
                min={0}
                max={60}
                label="Years of experience"
                defaultValue={String(p.yearsExperience)}
                required
              />
            </div>
            <TextAreaField
              id="bio"
              name="bio"
              label="About you"
              maxLength={1200}
              defaultValue={p.bio}
              hint="A few sentences about how you work. Up to 1200 characters."
            />
            <CheckboxGroup
              legend="Specialisations"
              hint="Choose up to 6."
              name="specializations"
              options={SPECIALIZATION_KEYS.map((k) => ({ value: k, label: SPECIALIZATIONS[k] }))}
              selected={p.specializations}
            />
            <Field
              id="expertise"
              name="expertise"
              label="Areas of expertise"
              hint="Separate with commas, e.g. weaning, lunchboxes, Nigerian diets."
              defaultValue={p.expertise.join(", ")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="state"
                name="state"
                label="State"
                defaultValue={p.state ?? ""}
                required
              >
                <option value="" disabled>
                  Choose your state
                </option>
                {[...STATES].sort().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectField>
              <Field id="city" name="city" label="City or area" defaultValue={p.city} />
            </div>
            <CheckboxGroup
              legend="Session types"
              name="sessionTypes"
              options={Object.entries(SESSION_TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
              }))}
              selected={p.sessionTypes}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="sessionFee"
                name="sessionFee"
                label="Session fee (₦)"
                inputMode="decimal"
                hint="Clients pay you directly. Equals only shows this fee."
                defaultValue={p.sessionFeeMinor > 0 ? String(p.sessionFeeMinor / 100) : ""}
                required
              />
              <Field
                id="sessionMinutes"
                name="sessionMinutes"
                type="number"
                min={15}
                max={240}
                step={5}
                label="Session length (minutes)"
                defaultValue={String(p.sessionMinutes)}
                required
              />
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-ink">Contact details</legend>
              <p className="text-sm text-muted">
                Shown to signed-in users on your profile once you are verified. Give at least one.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  label="Email"
                  defaultValue={p.contactEmail ?? ""}
                />
                <Field
                  id="contactPhone"
                  name="contactPhone"
                  type="tel"
                  label="Phone"
                  defaultValue={p.contactPhone ?? ""}
                />
                <Field
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  label="WhatsApp"
                  defaultValue={p.whatsapp ?? ""}
                />
              </div>
            </fieldset>
          </ActionForm>
        )}
      </Card>
      <Card
        title="Photo"
        description="A clear, professional photo of your face. JPEG or PNG, up to 2 MB."
      >
        <div className="flex flex-wrap items-start gap-4">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
            <img
              src={photoThumbnail(p.photoUrl, 128)}
              alt="Your current photo"
              width={96}
              height={96}
              className="rounded-full"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-24 items-center justify-center rounded-full bg-subtle text-3xl"
            >
              👤
            </div>
          )}
          <ActionForm
            action={uploadPhotoAction}
            submitLabel="Upload photo"
            pendingLabel="Uploading…"
          >
            <Field
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png"
              label="Choose a photo"
              required
            />
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
