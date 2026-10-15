import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductFields } from "@/components/vendors/product-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Button, Card, Field } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";
import { productProblems } from "@/lib/vendors/product";
import { requireVendor } from "@/lib/vendors/server";
import {
  deleteProductAction,
  submitProductAction,
  updateProductAction,
  uploadProductImageAction,
} from "../../../actions";

export const metadata: Metadata = { title: "Product — Vendor portal" };

/** Edit a product, add its image and submit it for review (ADR-067). */
export default async function ProductPage({ params }: PageProps<"/vendor/products/[id]">) {
  const { id } = await params;
  const { org } = await requireVendor(`/vendor/products/${id}`);
  const p = await getPrisma().product.findFirst({ where: { id, organizationId: org.id } });
  if (!p) notFound();
  const locked = p.status === "submitted" || p.status === "suspended" || p.status === "rejected";
  const problems = productProblems(p);
  const canSubmit = p.status === "draft" || p.status === "changes_requested";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/vendor/products" className="text-sm text-brand-text underline">
          All products
        </Link>
        <Badge tone={p.status === "verified" ? "success" : "neutral"}>
          {REVIEW_STATUS_LABEL[p.status]}
        </Badge>
      </div>
      {p.reviewNote &&
        (p.status === "changes_requested" ||
          p.status === "rejected" ||
          p.status === "suspended") && (
          <Alert tone="warning">Reviewer&apos;s note: {p.reviewNote}</Alert>
        )}
      {canSubmit && (
        <Card title="Submit for review">
          {problems.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {problems.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <ActionForm
              action={submitProductAction.bind(null, p.id)}
              submitLabel="Submit for review"
              pendingLabel="Submitting…"
            >
              <p className="text-sm text-ink">
                Ready. A reviewer checks the details and claims. It is recommended only once both
                the product and your business are verified.
              </p>
            </ActionForm>
          )}
        </Card>
      )}
      <Card
        title={p.name}
        description={
          p.status === "verified"
            ? "Saving changes sends a verified product back for review."
            : undefined
        }
      >
        {locked ? (
          <p className="text-sm text-muted">
            This product cannot be edited while it is {REVIEW_STATUS_LABEL[p.status].toLowerCase()}.
          </p>
        ) : (
          <ActionForm action={updateProductAction.bind(null, p.id)} submitLabel="Save product">
            <ProductFields p={p} />
          </ActionForm>
        )}
      </Card>
      <Card
        title="Image"
        description="A clear photo of the product or pack. JPEG or PNG, up to 2 MB."
      >
        <div className="flex flex-wrap items-start gap-4">
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
            <img
              src={photoThumbnail(p.imageUrl, 200)}
              alt={`Current image of ${p.name}`}
              width={120}
              height={120}
              className="rounded-lg"
            />
          )}
          {!locked && (
            <ActionForm
              action={uploadProductImageAction.bind(null, p.id)}
              submitLabel="Upload image"
              pendingLabel="Uploading…"
            >
              <Field
                id="image"
                name="image"
                type="file"
                accept="image/jpeg,image/png"
                label="Choose an image"
                required
              />
            </ActionForm>
          )}
        </div>
      </Card>
      <form action={deleteProductAction.bind(null, p.id)}>
        <Button type="submit" variant="ghost">
          Delete this product
        </Button>
      </form>
    </>
  );
}
