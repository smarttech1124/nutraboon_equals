import { z } from "zod";
import { canonicalState } from "@/lib/budget/regions";
import { normalizeText } from "@/lib/nutrition/match";
import { findAllergenTerms } from "@/lib/safety/allergy";
import { isProductCategory } from "./categories";

/**
 * Product rules (ADR-067): form validation, claims Equals will not promote,
 * allergens, and what must be in place before a product is reviewed. All
 * deterministic; the reviewer still checks every product.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalNumber = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().min(0).max(max).nullable());

/** Values from the vendor's label. Shown as the vendor's, never as Equals data. */
export const labelNutritionSchema = z.object({
  basis: z.enum(["100g", "serving"]),
  servingLabel: z.string().trim().max(40).nullable(),
  energyKcal: z.number().min(0).max(1000).nullable(),
  proteinG: z.number().min(0).max(100).nullable(),
  fatG: z.number().min(0).max(100).nullable(),
  carbohydrateG: z.number().min(0).max(100).nullable(),
  sugarG: z.number().min(0).max(100).nullable(),
  fiberG: z.number().min(0).max(100).nullable(),
  sodiumMg: z.number().min(0).max(10000).nullable(),
});
export type LabelNutrition = z.infer<typeof labelNutritionSchema>;

export const LABEL_FIELDS: {
  key: keyof LabelNutrition;
  label: string;
  unit: string;
  max: number;
}[] = [
  { key: "energyKcal", label: "Energy", unit: "kcal", max: 1000 },
  { key: "proteinG", label: "Protein", unit: "g", max: 100 },
  { key: "fatG", label: "Fat", unit: "g", max: 100 },
  { key: "carbohydrateG", label: "Carbohydrate", unit: "g", max: 100 },
  { key: "sugarG", label: "of which sugars", unit: "g", max: 100 },
  { key: "fiberG", label: "Fibre", unit: "g", max: 100 },
  { key: "sodiumMg", label: "Sodium", unit: "mg", max: 10000 },
] as const as { key: keyof LabelNutrition; label: string; unit: string; max: number }[];

export const purchaseLocationSchema = z.object({
  kind: z.enum(["store", "online"]),
  name: z.string().trim().min(2).max(80),
  state: z.string().nullable(),
  city: z.string().trim().max(60).nullable(),
  url: z
    .url()
    .refine((u) => u.startsWith("https://"), "Links must start with https://")
    .nullable(),
});
export type PurchaseLocation = z.infer<typeof purchaseLocationSchema>;

export function parseLocations(value: unknown): PurchaseLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = purchaseLocationSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseLabel(value: unknown): LabelNutrition | null {
  const parsed = labelNutritionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Health claims Equals never promotes (CLAUDE.md §22: no treatment or guaranteed outcomes). */
const CLAIM_TERMS =
  /\b(cures?|curing|treats?|treating|treatment for|heals?|healing|prevents?|preventing|reverses?|remed(y|ies)|miracle|guarantee[sd]?|detox(es|ify)?|anti-?cancer|fertility|boosts? (your )?immun\w*|lose \d+ ?(kg|kilos?|pounds|lbs))\b/;
const DISEASE_TERMS =
  /\b(cancers?|diabetes|diabetic|hypertension|high blood pressure|covid|malaria|typhoid|ulcers?|infertility|arthritis|hiv|kidney disease|heart disease|strokes?)\b/;

/**
 * Breast-milk substitutes are not promoted at all: Nigeria applies the
 * International Code of Marketing of Breast-milk Substitutes.
 */
const BREAST_MILK_SUBSTITUTE =
  /\b(infant formula|baby formula|follow[- ]?on formula|follow[- ]?up formula|growing[- ]?up milk|breast ?milk substitute|starter formula)\b/;

export type ClaimFinding = { field: string; term: string };

export function findClaims(fields: Record<string, string>): ClaimFinding[] {
  const findings: ClaimFinding[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const t = normalizeText(value);
    const claim = t.match(CLAIM_TERMS)?.[0];
    if (claim) findings.push({ field, term: claim });
    const disease = t.match(DISEASE_TERMS)?.[0];
    if (disease) findings.push({ field, term: disease });
  }
  return findings;
}

export function isBreastMilkSubstitute(
  name: string,
  ingredients: string[],
  description: string,
): boolean {
  return BREAST_MILK_SUBSTITUTE.test(normalizeText([name, description, ...ingredients].join(" ")));
}

/** Declared allergens plus any the app's vocabulary finds in the name and ingredients. */
export function productAllergens(
  declared: string[],
  name: string,
  ingredients: string[],
): string[] {
  const found = findAllergenTerms([name, ...ingredients].join(", ")).flatMap((m) => m.allergens);
  return [...new Set([...declared, ...found])].sort();
}

const list = (s: string, max: number, itemMax: number) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((x) => x.slice(0, itemMax));

export function readProductForm(formData: FormData) {
  const one = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  const base = z
    .object({
      name: text(100).min(2, "Enter the product name."),
      category: z.string().refine(isProductCategory, "Choose a category."),
      description: text(1200).min(10, "Describe the product in a sentence or two."),
      benefits: text(600),
      recommendedUse: text(400),
      availability: z.enum(["in_stock", "limited", "seasonal", "out_of_stock"]),
      priceNaira: optionalNumber(100_000_000),
    })
    .safeParse({
      name: one("name"),
      category: one("category"),
      description: one("description"),
      benefits: one("benefits"),
      recommendedUse: one("recommendedUse"),
      availability: one("availability") || "in_stock",
      priceNaira: one("priceNaira"),
    });
  if (!base.success) return { ok: false as const, error: base.error.issues[0].message };

  const ingredients = list(one("ingredients"), 40, 60);
  const matchTerms = [
    ...new Set(list(one("matchTerms"), 10, 40).map(normalizeText).filter(Boolean)),
  ];
  const declared = formData.getAll("allergens").filter((v): v is string => typeof v === "string");

  const labelNumbers: Record<string, number | null> = {};
  for (const f of LABEL_FIELDS) {
    const parsed = optionalNumber(f.max).safeParse(one(`label:${f.key}`));
    if (!parsed.success)
      return {
        ok: false as const,
        error: `${f.label} on the label must be a number up to ${f.max}.`,
      };
    labelNumbers[f.key] = parsed.data;
  }
  const hasLabel = Object.values(labelNumbers).some((v) => v !== null);
  const label = hasLabel
    ? labelNutritionSchema.safeParse({
        basis: one("label:basis") === "serving" ? "serving" : "100g",
        servingLabel: one("label:servingLabel").trim() || null,
        ...labelNumbers,
      })
    : null;
  if (label && !label.success)
    return { ok: false as const, error: "Check the nutrition label values." };

  const locations: PurchaseLocation[] = [];
  for (let i = 0; i < 5; i++) {
    const name = one(`loc:${i}:name`).trim();
    if (!name) continue;
    const parsed = purchaseLocationSchema.safeParse({
      kind: one(`loc:${i}:kind`) === "online" ? "online" : "store",
      name,
      state: canonicalState(one(`loc:${i}:state`)) ?? null,
      city: one(`loc:${i}:city`).trim() || null,
      url: one(`loc:${i}:url`).trim() || null,
    });
    if (!parsed.success) {
      return {
        ok: false as const,
        error: `Where to buy (${name}): ${parsed.error.issues[0].message}`,
      };
    }
    locations.push(parsed.data);
  }

  return {
    ok: true as const,
    value: {
      ...base.data,
      ingredients,
      matchTerms: matchTerms.length > 0 ? matchTerms : [normalizeText(base.data.name)],
      allergens: productAllergens(declared, base.data.name, ingredients),
      labelNutrition: label && label.success ? label.data : null,
      purchaseLocations: locations,
    },
  };
}

export type ProductFacts = {
  name: string;
  description: string;
  benefits: string;
  recommendedUse: string;
  ingredients: string[];
  purchaseLocations: unknown;
};

/** What stops a product being submitted, in plain words. */
export function productProblems(p: ProductFacts): string[] {
  const problems: string[] = [];
  if (p.description.trim().length < 10) problems.push("Add a description.");
  if (p.ingredients.length === 0) problems.push("List the ingredients.");
  if (parseLocations(p.purchaseLocations).length === 0)
    problems.push("Add at least one place to buy it.");
  if (isBreastMilkSubstitute(p.name, p.ingredients, p.description)) {
    problems.push(
      "Breast-milk substitutes such as infant formula cannot be promoted on Nutraboom Equals.",
    );
  }
  const claims = findClaims({
    name: p.name,
    description: p.description,
    benefits: p.benefits,
    "recommended use": p.recommendedUse,
  });
  if (claims.length > 0) {
    problems.push(
      `Remove health or treatment claims (${[...new Set(claims.map((c) => `"${c.term}" in ${c.field}`))].join(", ")}). Describe the food, not what it cures.`,
    );
  }
  return problems;
}
