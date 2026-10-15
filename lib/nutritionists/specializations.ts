/**
 * Areas a nutritionist can list (ADR-064). Keys are stored; labels are shown.
 * Chat referrals map to these keys so suggestions fit the user's situation.
 */
export const SPECIALIZATIONS = {
  general: "General nutrition",
  maternal: "Pregnancy and breastfeeding",
  child: "Infant and child nutrition",
  diabetes: "Diabetes",
  heart: "Heart health and blood pressure",
  kidney: "Kidney health",
  weight: "Weight management",
  allergies: "Food allergies and intolerances",
  digestive: "Digestive health",
  sports: "Sports nutrition",
  older_adults: "Older adults",
  eating_disorders: "Eating disorders",
  community: "Community and public health nutrition",
} as const;

export type Specialization = keyof typeof SPECIALIZATIONS;
export const SPECIALIZATION_KEYS = Object.keys(SPECIALIZATIONS) as Specialization[];

export function isSpecialization(value: string): value is Specialization {
  return Object.hasOwn(SPECIALIZATIONS, value);
}

/** Condition keys from lib/safety (e.g. "diabetes") to the specialisations that cover them. */
const CONDITION_SPECIALIZATIONS: Record<string, Specialization[]> = {
  diabetes: ["diabetes"],
  hypertension: ["heart"],
  heart_disease: ["heart"],
  kidney_disease: ["kidney"],
  eating_disorder: ["eating_disorders"],
  malnutrition: ["child", "community"],
  sickle_cell: ["general"],
  stomach_ulcer: ["digestive"],
  gout: ["kidney", "general"],
  cancer: ["general"],
};

/**
 * Specialisations that fit the sensitive situations chat detected
 * (lib/safety/referrals.ts categories, e.g. "pregnancy", "condition:diabetes").
 */
export function specializationsFor(categories: string[], hasAllergies: boolean): Specialization[] {
  const out = new Set<Specialization>();
  for (const category of categories) {
    if (category === "pregnancy" || category === "breastfeeding") out.add("maternal");
    else if (category === "child") out.add("child");
    else if (category.startsWith("condition:")) {
      for (const s of CONDITION_SPECIALIZATIONS[category.slice("condition:".length)] ?? []) {
        out.add(s);
      }
    }
  }
  if (hasAllergies) out.add("allergies");
  return [...out];
}

export const SESSION_TYPE_LABEL = { online: "Online", in_person: "In person" } as const;
export type SessionTypeKey = keyof typeof SESSION_TYPE_LABEL;
