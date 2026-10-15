/** A promoted product as shown in recommendations and the directory (ADR-067). */
export type ProductCard = {
  id: string;
  name: string;
  vendorName: string;
  category: string;
  imageUrl: string | null;
  description: string;
  availability: "in_stock" | "limited" | "seasonal" | "out_of_stock";
  priceNaira: number | null;
  /** Where it can be bought, as short text, e.g. "Shoprite Ikeja (Lagos)". */
  whereToBuy: string[];
  /** Food the product matched, e.g. "yogurt", when it came from a recommendation. */
  matchedTerm?: string;
};

/** Finds products for foods in a reply, plan or shopping list; the app decides, never the AI. */
export type ProductFinder = (context: ProductContext) => Promise<ProductCard[]>;

export type ProductContext = {
  /** Food names to match, e.g. a reply's recommended foods or shopping items. */
  terms: string[];
  /** Allergen keys to exclude. */
  allergies: string[];
  /** Foods the user avoids, in their words. */
  avoidFoods?: string[];
  infant?: boolean;
  childUnder5?: boolean;
  pregnant?: boolean;
  state?: string | null;
  limit?: number;
  /**
   * Recent conversation text, for moments when the reply itself names no
   * food (ADR-078): a product's own match terms are looked for in it.
   */
  recentText?: string;
};
