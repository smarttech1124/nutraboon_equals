import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@admin/components/listing";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Card, TextAreaField } from "@/components/ui";
import { can } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db";
import { vendorListing } from "@/lib/directory/visibility";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { allergenLabel } from "@/lib/safety/allergy";
import {
  AVAILABILITY_LABEL,
  PRODUCT_CATEGORIES,
  REVIEW_STATUS_LABEL,
  isProductCategory,
} from "@/lib/vendors/categories";
import { LABEL_FIELDS, parseLabel, parseLocations, productProblems } from "@/lib/vendors/product";
import { productReviewAction, vendorReviewAction } from "../actions";

export const metadata: Metadata = { title: "Review vendor" };

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

function Decisions({
  status,
  action,
  hidden,
  name,
}: {
  status: string;
  action: typeof vendorReviewAction;
  hidden: Record<string, string>;
  name: string;
}) {
  const options = DECISIONS[status] ?? [];
  if (options.length === 0) return <p className="text-sm text-muted">Nothing to decide yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((d) => (
        <ActionForm
          key={d.decision}
          action={action}
          submitLabel={d.label}
          variant={d.variant}
          confirm={`${d.label}: ${name}?`}
          className="flex flex-col gap-2 rounded-lg border border-line p-3"
        >
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="decision" value={d.decision} />
          {d.note && (
            <TextAreaField
              id={`note-${Object.values(hidden)[0]}-${d.decision}`}
              name="note"
              label="Note to the vendor"
              rows={2}
              maxLength={1000}
              required
            />
          )}
        </ActionForm>
      ))}
    </div>
  );
}

/** One vendor: business details, products and review decisions (ADR-067). */
export default async function VendorReviewPage({ params }: PageProps<"/vendors/[id]">) {
  const access = await adminAccess("vendors.verify");
  if (!access.ok) return <NotAllowed />;
  const { id } = await params;
  const org = await getPrisma().organization.findFirst({
    where: { id, kind: "vendor" },
    include: {
      vendor: true,
      products: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
      memberships: { where: { role: "owner" }, include: { user: { select: { email: true } } } },
    },
  });
  if (!org?.vendor) notFound();
  const v = org.vendor;
  const listing = await vendorListing(org.id);
  const roles = access.user.adminRoles;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/vendors" className="text-sm text-brand-text underline">
        Back to vendors
      </Link>
      <PageHeader
        title={org.name}
        description={`Owner: ${org.memberships.map((m) => m.user.email).join(", ")}`}
        actions={
          <Badge tone={v.status === "verified" ? "success" : "warning"}>
            {REVIEW_STATUS_LABEL[v.status]}
          </Badge>
        }
      />
      <ListingCard
        status={listing}
        kind="vendor"
        holderId={org.id}
        publicHref="/products"
        canGrant={can(roles, "subscriptions.manage")}
        canSettings={can(roles, "settings.manage")}
      />
      <Card title="Business">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Categories</dt>
            <dd className="text-ink">
              {v.categories
                .map((c) => (isProductCategory(c) ? PRODUCT_CATEGORIES[c] : c))
                .join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">CAC registration</dt>
            <dd className="text-ink">{v.registrationNumber ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-muted">Location</dt>
            <dd className="text-ink">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Contact</dt>
            <dd className="break-all text-ink">
              {[v.contactEmail, v.contactPhone, v.website].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
        {v.description && (
          <p className="mt-3 text-sm whitespace-pre-line text-ink">{v.description}</p>
        )}
        {v.reviewNote && <p className="mt-3 text-sm text-muted">Last note: {v.reviewNote}</p>}
        <div className="mt-4">
          <Decisions
            status={v.status}
            action={vendorReviewAction}
            hidden={{ orgId: org.id }}
            name={org.name}
          />
        </div>
      </Card>

      <h2 className="text-lg font-semibold text-ink">Products</h2>
      {org.products.length === 0 && <p className="text-sm text-muted">No products yet.</p>}
      {org.products.map((p) => {
        const problems = productProblems(p);
        const label = parseLabel(p.labelNutrition);
        return (
          <Card
            key={p.id}
            title={p.name}
            description={`${isProductCategory(p.category) ? PRODUCT_CATEGORIES[p.category] : p.category} · ${AVAILABILITY_LABEL[p.availability]}`}
            actions={<Badge>{REVIEW_STATUS_LABEL[p.status]}</Badge>}
          >
            <div className="flex flex-col gap-3 text-sm">
              {problems.length > 0 && (
                <Alert tone="error">Automatic checks: {problems.join(" ")}</Alert>
              )}
              <div className="flex flex-wrap gap-4">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
                  <img
                    src={photoThumbnail(p.imageUrl, 200)}
                    alt={p.name}
                    width={120}
                    height={120}
                    className="rounded-lg"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-ink">{p.description}</p>
                  {p.benefits && (
                    <p className="text-ink">
                      <span className="font-medium">Benefits: </span>
                      {p.benefits}
                    </p>
                  )}
                  {p.recommendedUse && (
                    <p className="text-ink">
                      <span className="font-medium">Use: </span>
                      {p.recommendedUse}
                    </p>
                  )}
                  <p className="text-ink">
                    <span className="font-medium">Ingredients: </span>
                    {p.ingredients.join(", ")}
                  </p>
                  <p className="text-ink">
                    <span className="font-medium">Allergens: </span>
                    {p.allergens.map(allergenLabel).join(", ") || "none listed"}
                  </p>
                  <p className="text-ink">
                    <span className="font-medium">Recommended for: </span>
                    {p.matchTerms.join(", ")}
                  </p>
                  {label && (
                    <p className="text-ink">
                      <span className="font-medium">
                        Label (
                        {label.basis === "100g"
                          ? "per 100 g"
                          : `per serving ${label.servingLabel ?? ""}`}
                        ):{" "}
                      </span>
                      {LABEL_FIELDS.filter((f) => typeof label[f.key] === "number")
                        .map((f) => `${f.label} ${label[f.key]} ${f.unit}`)
                        .join(", ")}
                    </p>
                  )}
                  <p className="text-ink">
                    <span className="font-medium">Where to buy: </span>
                    {parseLocations(p.purchaseLocations)
                      .map((l) => `${l.name}${l.url ? ` (${l.url})` : ""}`)
                      .join("; ")}
                  </p>
                </div>
              </div>
              {p.reviewNote && <p className="text-muted">Last note: {p.reviewNote}</p>}
              {v.status !== "verified" && p.status === "submitted" && (
                <p className="text-muted">
                  The business is not verified yet: an approved product is listed only once it is.
                </p>
              )}
              <Decisions
                status={p.status}
                action={productReviewAction}
                hidden={{ productId: p.id }}
                name={p.name}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
