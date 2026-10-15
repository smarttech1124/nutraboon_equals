import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, EmptyState, Field, SelectField } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { canEdit } from "@/lib/nutritionists/profile";
import { requireNutritionist } from "@/lib/nutritionists/server";
import { getStorage } from "@/lib/storage/cloudinary";
import {
  addQualificationAction,
  removeDocumentAction,
  removeQualificationAction,
  uploadDocumentAction,
} from "../../actions";

export const metadata: Metadata = { title: "Qualifications — Nutritionist portal" };

const KIND_LABEL = {
  degree: "Degree",
  certification: "Certificate",
  registration: "Registration or licence",
  membership: "Professional membership",
} as const;

/** Qualifications and supporting documents (ADR-064). */
export default async function QualificationsPage() {
  const { user, status } = await requireNutritionist("/nutritionist/qualifications");
  const prisma = getPrisma();
  const [qualifications, documents] = await Promise.all([
    prisma.qualification.findMany({ where: { profileId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.qualificationDocument.findMany({
      where: { profileId: user.id },
      orderBy: { uploadedAt: "asc" },
    }),
  ]);
  const editable = canEdit(status);
  const uploads = getStorage() !== null;

  return (
    <>
      {status === "verified" && (
        <p className="text-sm text-muted">
          Adding or removing a qualification or document sends your profile back for review.
        </p>
      )}
      <Card title="Qualifications">
        {qualifications.length === 0 ? (
          <EmptyState title="No qualifications yet">
            Add your degrees, certificates and registration.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {qualifications.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{q.title}</p>
                  <p className="text-muted">
                    {KIND_LABEL[q.kind]} · {q.institution}
                    {q.year ? ` · ${q.year}` : ""}
                    {q.registrationNumber ? ` · No. ${q.registrationNumber}` : ""}
                    {q.expiresOn ? ` · expires ${q.expiresOn.toISOString().slice(0, 10)}` : ""}
                  </p>
                </div>
                {editable && (
                  <ActionForm
                    action={removeQualificationAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="secondary"
                    confirm={`Remove ${q.title}?`}
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="id" value={q.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <details className="mt-4 rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Add a qualification
            </summary>
            <div className="mt-4">
              <ActionForm action={addQualificationAction} submitLabel="Add qualification">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField id="kind" name="kind" label="Type" defaultValue="degree">
                    {Object.entries(KIND_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectField>
                  <Field
                    id="q-title"
                    name="title"
                    label="Title"
                    placeholder="e.g. BSc Nutrition and Dietetics"
                    required
                  />
                  <Field
                    id="institution"
                    name="institution"
                    label="Institution or issuing body"
                    required
                  />
                  <Field
                    id="year"
                    name="year"
                    type="number"
                    min={1950}
                    max={2100}
                    label="Year awarded"
                  />
                  <Field
                    id="registrationNumber"
                    name="registrationNumber"
                    label="Registration or licence number"
                    hint="Required for a registration or licence."
                  />
                  <Field id="expiresOn" name="expiresOn" type="date" label="Expiry date (if any)" />
                </div>
              </ActionForm>
            </div>
          </details>
        )}
      </Card>

      <Card
        title="Documents"
        description="Certificates and licences that support your qualifications. PDF, JPEG or PNG, up to 3 MB each. Only you and our reviewers can open them."
      >
        {documents.length === 0 ? (
          <EmptyState title="No documents yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm"
              >
                <a
                  href={`/nutritionist/documents/${d.id}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-brand-text underline"
                >
                  {d.label} <span className="sr-only">(opens in a new tab)</span>
                </a>
                <span className="text-muted">
                  {d.format.toUpperCase()} · {Math.max(1, Math.round(d.bytes / 1024))} KB
                </span>
                {editable && (
                  <ActionForm
                    action={removeDocumentAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="secondary"
                    confirm={`Remove ${d.label}?`}
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="id" value={d.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable &&
          (uploads ? (
            <div className="mt-4">
              <ActionForm
                action={uploadDocumentAction}
                submitLabel="Upload document"
                pendingLabel="Uploading…"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id="label"
                    name="label"
                    label="What is it?"
                    placeholder="e.g. BSc certificate"
                    required
                  />
                  <Field
                    id="document"
                    name="document"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    label="File"
                    required
                  />
                </div>
              </ActionForm>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Uploads are not available yet. Please check back later.
            </p>
          ))}
      </Card>
    </>
  );
}
