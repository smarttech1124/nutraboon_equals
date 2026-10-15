import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CheckboxGroup, Field, SelectField, TextAreaField } from "@/components/ui";
import { STATES } from "@/lib/budget/regions";
import { getPrisma } from "@/lib/db";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_KEYS } from "@/lib/vendors/categories";
import { requireVendor } from "@/lib/vendors/server";
import { saveBusinessAction, uploadLogoAction } from "../../actions";

export const metadata: Metadata = { title: "Business — Vendor portal" };

/** The business profile and logo (ADR-067). */
export default async function BusinessPage() {
  const { org, status } = await requireVendor("/vendor/business");
  const p = await getPrisma().vendorProfile.findUniqueOrThrow({
    where: { organizationId: org.id },
  });

  return (
    <>
      <Card
        title="Business profile"
        description={
          status === "verified"
            ? "Changing the name, registration number or categories sends your business back for review."
            : "Shown on your product pages once verified."
        }
      >
        {status === "submitted" ? (
          <p className="text-sm text-muted">
            Your business is being reviewed. You can edit it afterwards.
          </p>
        ) : (
          <ActionForm action={saveBusinessAction} submitLabel="Save business profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="name"
                name="name"
                label="Business name"
                defaultValue={org.name}
                required
                maxLength={100}
              />
              <Field
                id="registrationNumber"
                name="registrationNumber"
                label="CAC registration number (if registered)"
                defaultValue={p.registrationNumber ?? ""}
              />
            </div>
            <TextAreaField
              id="description"
              name="description"
              label="About the business"
              maxLength={1200}
              defaultValue={p.description}
              hint="What you make or sell, and how."
            />
            <CheckboxGroup
              legend="What you sell"
              name="categories"
              options={PRODUCT_CATEGORY_KEYS.map((k) => ({
                value: k,
                label: PRODUCT_CATEGORIES[k],
              }))}
              selected={p.categories}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="website"
                name="website"
                type="url"
                label="Website"
                defaultValue={p.website ?? ""}
              />
              <Field
                id="contactEmail"
                name="contactEmail"
                type="email"
                label="Contact email"
                defaultValue={p.contactEmail ?? ""}
              />
              <Field
                id="contactPhone"
                name="contactPhone"
                type="tel"
                label="Contact phone"
                defaultValue={p.contactPhone ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="state" name="state" label="State" defaultValue={p.state ?? ""}>
                <option value="">Choose your state</option>
                {[...STATES].sort().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectField>
              <Field id="city" name="city" label="City or area" defaultValue={p.city} />
            </div>
          </ActionForm>
        )}
      </Card>
      <Card title="Logo" description="JPEG or PNG, up to 2 MB.">
        <div className="flex flex-wrap items-start gap-4">
          {p.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
            <img
              src={photoThumbnail(p.logoUrl, 128)}
              alt="Your current logo"
              width={96}
              height={96}
              className="rounded-lg"
            />
          )}
          <ActionForm action={uploadLogoAction} submitLabel="Upload logo" pendingLabel="Uploading…">
            <Field
              id="logo"
              name="logo"
              type="file"
              accept="image/jpeg,image/png"
              label="Choose a logo"
              required
            />
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
