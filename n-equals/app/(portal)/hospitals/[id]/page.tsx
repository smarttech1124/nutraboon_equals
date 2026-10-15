import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@admin/components/listing";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card, TextAreaField } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import { hospitalListing } from "@/lib/directory/visibility";
import { ACCESS_SERVICES, isAccessService } from "@/lib/hospitals/accessibility";
import { STAFF_ROLE_LABEL, type HospitalRole } from "@/lib/hospitals/server";
import { describeAvailability, parseAvailability } from "@/lib/nutritionists/availability";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";
import { hospitalReviewAction } from "../actions";

export const metadata: Metadata = { title: "Review hospital" };

type Variant = "primary" | "secondary" | "danger";
const DECISIONS: Record<
  string,
  { decision: string; label: string; variant: Variant; note: boolean }[]
> = {
  submitted: [
    { decision: "approve", label: "Approve", variant: "primary", note: false },
    { decision: "request_changes", label: "Request changes", variant: "secondary", note: true },
    { decision: "reject", label: "Reject", variant: "danger", note: true },
  ],
  changes_requested: [{ decision: "reject", label: "Reject", variant: "danger", note: true }],
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

/**
 * One hospital: details, departments and staff, and review decisions
 * (ADR-068). Patient conversations are not shown here.
 */
export default async function HospitalReviewPage({ params }: PageProps<"/hospitals/[id]">) {
  const access = await adminAccess("hospitals.verify");
  if (!access.ok) return <NotAllowed />;
  const { id } = await params;
  const org = await getPrisma().organization.findFirst({
    where: { id, kind: "hospital" },
    include: {
      hospital: true,
      departments: { orderBy: { name: "asc" } },
      memberships: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!org?.hospital) notFound();
  const h = org.hospital;
  const options = DECISIONS[h.status] ?? [];
  const listing = await hospitalListing(org.id);
  const roles = access.user.adminRoles;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/hospitals" className="text-sm text-brand-text underline">
        Back to hospitals
      </Link>
      <PageHeader
        title={org.name}
        actions={
          <Badge tone={h.status === "verified" ? "success" : "warning"}>
            {REVIEW_STATUS_LABEL[h.status]}
          </Badge>
        }
      />
      <ListingCard
        status={listing}
        kind="hospital"
        holderId={org.id}
        publicHref={`/hospitals/${org.id}`}
        canGrant={can(roles, "subscriptions.manage")}
        canSettings={can(roles, "settings.manage")}
      />
      <Card title="Details">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Registration number</dt>
            <dd className="text-ink">{h.registrationNumber ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-muted">Address</dt>
            <dd className="text-ink">
              {[h.address, h.area, h.city, h.state].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Contact</dt>
            <dd className="break-all text-ink">
              {[h.phone, h.emergencyPhone && `emergency ${h.emergencyPhone}`, h.email, h.website]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Map</dt>
            <dd className="text-ink">
              {h.latitude !== null && h.longitude !== null ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${h.latitude}&mlon=${h.longitude}#map=17/${h.latitude}/${h.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-text underline"
                >
                  Check the pin<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                "Not pinned"
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Accessibility</dt>
            <dd className="text-ink">
              {h.accessibility
                .filter(isAccessService)
                .map((a) => ACCESS_SERVICES[a])
                .join("; ") || "None listed"}
            </dd>
          </div>
        </dl>
        {h.description && (
          <p className="mt-3 text-sm whitespace-pre-line text-ink">{h.description}</p>
        )}
        {h.reviewNote && <p className="mt-3 text-sm text-muted">Last note: {h.reviewNote}</p>}
      </Card>
      <Card title="Departments">
        <ul className="flex flex-col divide-y divide-line text-sm">
          {org.departments.map((d) => (
            <li key={d.id} className="py-2">
              <span className="font-semibold text-ink">{d.name}</span>
              {!d.active && <span className="text-muted"> (hidden)</span>}
              <span className="text-muted">
                {" "}
                · {describeAvailability(parseAvailability(d.availability)).join(", ") || "no times"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Staff">
        <ul className="flex flex-col gap-1 text-sm">
          {org.memberships.map((m) => (
            <li key={m.userId} className="text-ink">
              {m.user.name} · {m.user.email} · {STAFF_ROLE_LABEL[m.role as HospitalRole] ?? m.role}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Decision">
        {options.length === 0 ? (
          <p className="text-sm text-muted">Nothing to decide yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((d) => (
              <ActionForm
                key={d.decision}
                action={hospitalReviewAction}
                submitLabel={d.label}
                variant={d.variant}
                confirm={`${d.label}: ${org.name}?`}
                className="flex flex-col gap-2 rounded-lg border border-line p-3"
              >
                <input type="hidden" name="orgId" value={org.id} />
                <input type="hidden" name="decision" value={d.decision} />
                {d.note && (
                  <TextAreaField
                    id={`note-${d.decision}`}
                    name="note"
                    label="Note to the hospital"
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
