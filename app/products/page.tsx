import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";
import { connection } from "next/server";
import { ProductCardView } from "@/components/vendors/product-card";
import { Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import {
  isProductCategory,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_KEYS,
} from "@/lib/vendors/categories";
import { browseProducts } from "@/lib/vendors/directory";

export const metadata: Metadata = { title: "Products from verified vendors" };

const INPUT = "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink";

/** Product discovery (ADR-067): verified products from verified, listed vendors. */
export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  // Per request: the feature flag and listings change without a deploy.
  await connection();
  if (!(await getEntitlementService().isEnabled("vendors"))) {
    return (
      <ComingSoon
        icon="basket"
        title="Verified food products"
        text="We are reviewing the first Nigerian food businesses. Their products will appear here with full ingredients, allergens and where to buy."
        partnerHref="/for-vendors"
        partnerLabel="List your products"
      />
    );
  }
  const params = await searchParams;
  const category =
    typeof params.category === "string" && isProductCategory(params.category)
      ? params.category
      : undefined;
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const cards = await browseProducts({ category, q });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Products from verified vendors</h1>
        <p className="mt-1 text-muted">
          Sponsored listings from businesses our reviewers have checked. Nutraboom Equals does not
          sell these products; buy them from the places shown.
        </p>
      </div>
      <Card>
        <form
          role="search"
          aria-label="Find products"
          className="grid gap-4 sm:grid-cols-3 sm:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Search
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="e.g. yogurt"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Category
            <select name="category" defaultValue={category ?? ""} className={INPUT}>
              <option value="">All</option>
              {PRODUCT_CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PRODUCT_CATEGORIES[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
          >
            Search
          </button>
        </form>
      </Card>
      {cards.length === 0 ? (
        <Card>
          <EmptyState title="No products found" />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id}>
              <ProductCardView card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
