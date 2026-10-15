import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Badge, Card } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { allergenLabel } from "@/lib/safety/allergy";
import {
  AVAILABILITY_LABEL,
  PRODUCT_CATEGORIES,
  isProductCategory,
} from "@/lib/vendors/categories";
import { isListedProduct } from "@/lib/vendors/directory";
import { LABEL_FIELDS, parseLabel, parseLocations } from "@/lib/vendors/product";
import { countQuietly } from "@/lib/vendors/stats";

export const metadata: Metadata = { title: "Product" };

/** A verified product's information page (ADR-067). */
export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  if (!(await isListedProduct(id))) notFound();
  const p = await getPrisma().product.findUnique({
    where: { id },
    include: { organization: { include: { vendor: true } } },
  });
  if (!p) notFound();
  after(() => countQuietly([p.id], "views"));
  const label = parseLabel(p.labelNutrition);
  const locations = parseLocations(p.purchaseLocations);
  const vendor = p.organization.vendor;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-3">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
          <img
            src={photoThumbnail(p.imageUrl, 640)}
            alt={p.name}
            width={480}
            height={480}
            className="w-full rounded-2xl object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex aspect-square items-center justify-center rounded-2xl bg-subtle text-6xl"
          >
            🛒
          </div>
        )}
        <p className="text-xs text-muted">
          Sponsored listing. Product details come from the vendor and were checked by our reviewers
          for safety and claims; Nutraboom Equals does not sell this product.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted">
            {isProductCategory(p.category) ? PRODUCT_CATEGORIES[p.category] : p.category}
          </p>
          <h1 className="text-2xl font-bold text-ink">{p.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink">by {p.organization.name}</span>
            <Badge tone="success">Verified product</Badge>
            <Badge>{AVAILABILITY_LABEL[p.availability]}</Badge>
          </p>
        </div>
        <p className="text-ink whitespace-pre-line">{p.description}</p>
        {p.benefits && (
          <Card title="Nutritional benefits (from the vendor)">
            <p className="text-sm text-ink">{p.benefits}</p>
          </Card>
        )}
        {label && (
          <Card
            title="Nutrition label"
            description={`From the vendor's label, ${label.basis === "100g" ? "per 100 g" : `per serving${label.servingLabel ? ` (${label.servingLabel})` : ""}`}. Not verified by Nutraboom Equals.`}
          >
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {LABEL_FIELDS.filter((f) => typeof label[f.key] === "number").map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="text-ink">
                    {String(label[f.key])} {f.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
        <Card title="Ingredients and allergens">
          <p className="text-sm text-ink">{p.ingredients.join(", ")}</p>
          <p className="mt-2 text-sm text-ink">
            <span className="font-medium">Contains: </span>
            {p.allergens.length > 0
              ? p.allergens.map(allergenLabel).join(", ")
              : "no listed allergens"}
          </p>
        </Card>
        {p.recommendedUse && (
          <Card title="Recommended use">
            <p className="text-sm text-ink">{p.recommendedUse}</p>
          </Card>
        )}
        <Card
          title="Where to buy"
          description={
            p.priceNaira
              ? `Typical price about ₦${p.priceNaira.toLocaleString("en-NG")}, set by the vendor.`
              : undefined
          }
        >
          <ul className="flex flex-col gap-2 text-sm">
            {locations.map((l, i) => (
              <li key={i} className="text-ink">
                {l.url ? (
                  <a
                    href={`/products/${p.id}/go/${i}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-text underline"
                  >
                    {l.name}
                    <span className="sr-only"> (opens the shop&apos;s site in a new tab)</span>
                  </a>
                ) : (
                  <span className="font-semibold">{l.name}</span>
                )}
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {l.kind === "online"
                    ? "online"
                    : [l.city, l.state].filter(Boolean).join(", ") || "shop"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {vendor && (
          <Card title={`About ${p.organization.name}`}>
            {vendor.description && <p className="text-sm text-ink">{vendor.description}</p>}
            <p className="mt-2 text-sm text-muted">
              {[vendor.city, vendor.state].filter(Boolean).join(", ")}
              {vendor.website && (
                <>
                  {" · "}
                  <a
                    href={vendor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Website
                  </a>
                </>
              )}
              {vendor.contactPhone ? ` · ${vendor.contactPhone}` : ""}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
