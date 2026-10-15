import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@admin/components/listing";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Card, EmptyState, TextAreaField } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import { nutritionistListing } from "@/lib/directory/visibility";
import type { Assessment, Check } from "@/lib/nutritionists/analysis";
import { describeAvailability, parseAvailability } from "@/lib/nutritionists/availability";
import { STATUS_LABEL } from "@/lib/nutritionists/profile";
import { SPECIALIZATIONS, isSpecialization } from "@/lib/nutritionists/specializations";
import { rerunAnalysisAction, reviewAction } from "../actions";

export const metadata: Metadata = { title: "Review nutritionist" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

const DECISIONS: Record<
  string,
  { decision: string; label: string; variant: "primary" | "secondary" | "danger"; note: boolean }[]
> = {
  submitted: [
    { decision: "approve", label: "Approve", variant: "primary", note: false },
    { decision: "request_changes", label: "Request changes", variant: "secondary", note: true },
    { decision: "reject", label: "Reject", variant: "danger", note: true },
    { decision: "suspend", label: "Suspend", variant: "danger", note: true },
  ],
  changes_requested: [
    { decision: "reject", label: "Reject", variant: "danger", note: true },
    { decision: "suspend", label: "Suspend", variant: "danger", note: true },
  ],
  verified: [
    { decision: "request_changes", label: "Request changes", variant: "secondary", note: true },
    { decision: "suspend", label: "Suspend", variant: "danger", note: true },
  ],
  suspended: [{ decision: "reinstate", label: "Reinstate", variant: "primary", note: false }],
  rejected: [
    { decision: "reinstate", label: "Approve after all", variant: "secondary", note: false },
  ],
  draft: [],
};

/** One nutritionist's profile, documents, analysis and the review decisions (ADR-064). */
export default async function ReviewPage({ params }: PageProps<"/nutritionists/[id]">) {
  const access = await adminAccess("nutritionists.verify");
  if (!access.ok) return <NotAllowed />;
  const { id } = await params;
  const p = await getPrisma().nutritionistProfile.findUnique({
    where: { userId: id },
    include: {
      user: { select: { name: true, email: true, status: true } },
      qualifications: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { uploadedAt: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!p) notFound();
  const analysis = p.analyses[0];
  const checks = (analysis?.checks ?? []) as Check[];
  const assessment = analysis?.assessment as Assessment | null | undefined;
  const own = id === access.user.id;
  const listing = await nutritionistListing(id);
  const roles = access.user.adminRoles;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/nutritionists" className="text-sm text-brand-text underline">
        Back to nutritionists
      </Link>
      <PageHeader
        title={p.user.name}
        description={`${p.title || "No title"} · ${p.user.email}`}
        actions={
          <Badge tone={p.status === "verified" ? "success" : "warning"}>
            {STATUS_LABEL[p.status]}
          </Badge>
        }
      />
      <ListingCard
        status={listing}
        kind="nutritionist"
        holderId={id}
        publicHref={`/nutritionists/${id}`}
        canGrant={can(roles, "subscriptions.manage")}
        canSettings={can(roles, "settings.manage")}
      />
      {p.reviewNote && <Alert tone="info">Last note to the nutritionist: {p.reviewNote}</Alert>}

      <Card title="Profile">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Specialisations</dt>
            <dd className="text-ink">
              {p.specializations
                .map((s) => (isSpecialization(s) ? SPECIALIZATIONS[s] : s))
                .join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Experience</dt>
            <dd className="text-ink">{p.yearsExperience} years</dd>
          </div>
          <div>
            <dt className="text-muted">Location</dt>
            <dd className="text-ink">{[p.city, p.state].filter(Boolean).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Sessions</dt>
            <dd className="text-ink">
              {p.sessionTypes.join(", ") || "—"} · ₦
              {(p.sessionFeeMinor / 100).toLocaleString("en-NG")} · {p.sessionMinutes} min
            </dd>
          </div>
          <div>
            <dt className="text-muted">Availability</dt>
            <dd className="text-ink">
              {describeAvailability(parseAvailability(p.availability)).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Contact</dt>
            <dd className="text-ink">
              {[p.contactPhone, p.whatsapp, p.contactEmail].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
        {p.bio && <p className="mt-4 text-sm whitespace-pre-line text-ink">{p.bio}</p>}
      </Card>

      <Card
        title="Qualifications and documents"
        description="Compare each document with the listed qualification, and check registrations with the issuing body."
      >
        {p.qualifications.length === 0 ? (
          <EmptyState title="No qualifications" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {p.qualifications.map((q) => (
              <li key={q.id} className="rounded-lg border border-line p-3">
                <p className="font-semibold text-ink">{q.title}</p>
                <p className="text-muted">
                  {q.kind} · {q.institution}
                  {q.year ? ` · ${q.year}` : ""}
                  {q.registrationNumber ? ` · No. ${q.registrationNumber}` : ""}
                  {q.expiresOn ? ` · expires ${q.expiresOn.toISOString().slice(0, 10)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4 mb-2 text-sm font-semibold text-ink">Documents</h3>
        {p.documents.length === 0 ? (
          <p className="text-sm text-muted">No documents uploaded.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {p.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={`/nutritionists/documents/${d.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-brand-text underline"
                >
                  {d.label} ({d.format.toUpperCase()}){" "}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Qualification analysis"
        description={
          analysis
            ? `Advisory only. ${dateTime.format(analysis.createdAt)} · ${analysis.provider ?? "no AI provider"} · ${analysis.promptVersion}`
            : "Not run yet."
        }
        actions={
          <ActionForm
            action={rerunAnalysisAction}
            submitLabel="Run analysis"
            pendingLabel="Running…"
            variant="secondary"
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="userId" value={id} />
          </ActionForm>
        }
      >
        {checks.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? "text-ink" : "text-danger"}>
                <span aria-hidden="true">{c.ok ? "✓ " : "⚠ "}</span>
                <span className="sr-only">{c.ok ? "Passed: " : "Needs attention: "}</span>
                {c.message}
              </li>
            ))}
          </ul>
        )}
        {analysis && !assessment && (
          <p className="mt-3 text-sm text-muted">
            {analysis.status === "unavailable"
              ? "No AI provider with structured output is configured; only the checks above ran."
              : "The AI assessment failed or was invalid; only the checks above ran."}
          </p>
        )}
        {assessment && (
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <p className="text-ink">
              <span className="font-semibold">Relevance: {assessment.relevance}.</span>{" "}
              {assessment.relevanceReason}
            </p>
            {assessment.specializationSupport.length > 0 && (
              <ul className="flex flex-col gap-1">
                {assessment.specializationSupport.map((s) => (
                  <li key={s.specialization} className="text-ink">
                    {isSpecialization(s.specialization)
                      ? SPECIALIZATIONS[s.specialization]
                      : s.specialization}
                    : {s.supported}. {s.reason}
                  </li>
                ))}
              </ul>
            )}
            {assessment.manualChecks.length > 0 && (
              <div>
                <p className="font-semibold text-ink">Check by hand:</p>
                <ul className="list-disc pl-5 text-ink">
                  {assessment.manualChecks.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-muted">{assessment.summary}</p>
          </div>
        )}
      </Card>

      <Card title="Decision">
        {own ? (
          <p className="text-sm text-muted">You cannot review your own profile.</p>
        ) : (DECISIONS[p.status] ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nothing to decide until the profile is submitted.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {DECISIONS[p.status].map((d) => (
              <ActionForm
                key={d.decision}
                action={reviewAction}
                submitLabel={d.label}
                variant={d.variant}
                confirm={`${d.label}: ${p.user.name}?`}
                className="flex flex-col gap-2 rounded-lg border border-line p-3"
              >
                <input type="hidden" name="userId" value={id} />
                <input type="hidden" name="decision" value={d.decision} />
                {d.note && (
                  <TextAreaField
                    id={`note-${d.decision}`}
                    name="note"
                    label="Note to the nutritionist"
                    rows={2}
                    maxLength={1000}
                    required
                  />
                )}
              </ActionForm>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
