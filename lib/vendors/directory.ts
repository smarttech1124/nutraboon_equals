import { getEntitlementService } from "@/lib/billing";
import { grantCounts } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { parseLocations } from "./product";
import { recommend, type Candidate } from "./recommend";
import type { ProductCard, ProductContext } from "./types";

/**
 * Promoted products (ADR-067). A product is listed only when the Vendors
 * feature is on, the product and its vendor are verified, and the vendor is
 * entitled to a listing (free tier or a vendor plan held by the business).
 */

const SELECT = {
  id: true,
  name: true,
  category: true,
  description: true,
  ingredients: true,
  allergens: true,
  matchTerms: true,
  availability: true,
  priceNaira: true,
  imageUrl: true,
  purchaseLocations: true,
  organizationId: true,
  organization: { select: { name: true } },
} as const;

async function entitledVendors(orgIds: string[]): Promise<Set<string>> {
  if (orgIds.length === 0) return new Set();
  const service = getEntitlementService();
  if ((await service.freeTier())["vendor.listing"]) return new Set(orgIds);
  const [subs, graceDays] = await Promise.all([
    getPrisma().subscription.findMany({
      where: {
        organizationId: { in: orgIds },
        status: { in: ["active", "past_due"] },
        plan: { entitlements: { path: ["vendor.listing"], equals: true } },
      },
      select: { organizationId: true, status: true, currentPeriodEnd: true, graceUntil: true },
    }),
    service.graceDays(),
  ]);
  const now = new Date();
  return new Set(
    subs
      .filter((s) => grantCounts({ ...s, entitlements: {} }, now, graceDays))
      .map((s) => s.organizationId!),
  );
}

async function listedProducts(where: { id?: string; category?: string } = {}) {
  if (!(await getEntitlementService().isEnabled("vendors"))) return [];
  const products = await getPrisma().product.findMany({
    where: {
      ...where,
      status: "verified",
      organization: { kind: "vendor", vendor: { status: "verified" } },
    },
    select: SELECT,
    take: 500,
  });
  const entitled = await entitledVendors([...new Set(products.map((p) => p.organizationId))]);
  return products.filter((p) => entitled.has(p.organizationId));
}

type Listed = Awaited<ReturnType<typeof listedProducts>>[number];

function toCandidate(p: Listed): Candidate & { row: Listed } {
  const locations = parseLocations(p.purchaseLocations);
  return {
    id: p.id,
    name: p.name,
    ingredients: p.ingredients,
    allergens: p.allergens,
    matchTerms: p.matchTerms,
    availability: p.availability,
    states: locations.flatMap((l) => (l.kind === "store" && l.state ? [l.state] : [])),
    online: locations.some((l) => l.kind === "online"),
    row: p,
  };
}

export function toCard(p: Listed, matchedTerm?: string): ProductCard {
  return {
    id: p.id,
    name: p.name,
    vendorName: p.organization.name,
    category: p.category,
    imageUrl: p.imageUrl ? photoThumbnail(p.imageUrl, 320) : null,
    description: p.description.length > 160 ? `${p.description.slice(0, 157)}…` : p.description,
    availability: p.availability,
    priceNaira: p.priceNaira,
    whereToBuy: parseLocations(p.purchaseLocations).map((l) =>
      l.kind === "online"
        ? `${l.name} (online)`
        : `${l.name}${l.city || l.state ? ` (${[l.city, l.state].filter(Boolean).join(", ")})` : ""}`,
    ),
    ...(matchedTerm ? { matchedTerm } : {}),
  };
}

/** Products for the foods in a reply, a plan or a shopping list. */
export async function recommendProducts(context: ProductContext): Promise<ProductCard[]> {
  const listed = await listedProducts();
  return recommend(listed.map(toCandidate), context).map(({ candidate, term }) =>
    toCard(candidate.row, term),
  );
}

/** The product directory: everything listed, optionally by category or search text. */
export async function browseProducts(query: {
  category?: string;
  q?: string;
}): Promise<ProductCard[]> {
  const listed = await listedProducts(query.category ? { category: query.category } : {});
  const q = query.q?.trim().toLowerCase();
  const filtered = q
    ? listed.filter((p) =>
        [p.name, p.description, p.organization.name, ...p.matchTerms].some((t) =>
          t.toLowerCase().includes(q),
        ),
      )
    : listed;
  return filtered.slice(0, 60).map((p) => toCard(p));
}

export async function isListedProduct(id: string): Promise<boolean> {
  return (await listedProducts({ id })).length > 0;
}
