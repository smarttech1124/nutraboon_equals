/** Vendor and product categories (ADR-067). Keys are stored; labels are shown. */
export const PRODUCT_CATEGORIES = {
  grains: "Grains and cereals",
  tubers: "Tubers and flours (garri, yam flour)",
  legumes: "Beans and legumes",
  dairy: "Dairy and alternatives (milk, yogurt)",
  eggs: "Eggs",
  fish: "Fish and seafood",
  meat: "Meat and poultry",
  vegetables: "Vegetables",
  fruits: "Fruits",
  nuts_seeds: "Nuts and seeds",
  oils: "Cooking oils",
  baby_food: "Food for babies and young children",
  drinks: "Drinks",
  snacks: "Snacks",
  spices: "Spices and seasoning",
  other: "Other food products",
} as const;

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES;
export const PRODUCT_CATEGORY_KEYS = Object.keys(PRODUCT_CATEGORIES) as ProductCategory[];

export function isProductCategory(value: string): value is ProductCategory {
  return Object.hasOwn(PRODUCT_CATEGORIES, value);
}

export const AVAILABILITY_LABEL = {
  in_stock: "In stock",
  limited: "Limited stock",
  seasonal: "Seasonal",
  out_of_stock: "Out of stock",
} as const;

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  verified: "Verified",
  rejected: "Not approved",
  suspended: "Suspended",
};
