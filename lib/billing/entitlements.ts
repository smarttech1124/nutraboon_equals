import { z } from "zod";

/**
 * What a subscription can unlock (ADR-062). Limits are data: the free tier's
 * values are defaults here, overridable in n-equals (PlatformSetting
 * "billing.freeEntitlements"), and each plan stores its own values. Code
 * asks the EntitlementService, never a hard-coded plan name.
 */

type NumberEntitlement = {
  kind: "number";
  label: string;
  description: string;
  /** The free tier's value when n-equals has not set one. */
  freeDefault: number;
  min: number;
  max: number;
};

type FlagEntitlement = {
  kind: "flag";
  label: string;
  description: string;
  freeDefault: boolean;
};

export const ENTITLEMENTS = {
  "mealPlanner.maxDays": {
    kind: "number",
    label: "Meal plan length (days)",
    description: "The longest meal plan the Meal Planner creates in one go.",
    freeDefault: 2,
    min: 1,
    max: 366,
  },
  "mealPlanner.plansPerMonth": {
    kind: "number",
    label: "Meal plans per month",
    description: "How many meal plans the Meal Planner creates each calendar month.",
    freeDefault: 4,
    min: 0,
    max: 10000,
  },
  "mealPlanner.shoppingList": {
    kind: "flag",
    label: "Shopping list with each plan",
    description: "A priced shopping list for the whole plan.",
    freeDefault: false,
  },
  "mealPlanner.adjustmentsPerWeek": {
    kind: "number",
    label: "Plan adjustments per week",
    description: "How often a week of a plan can be regenerated or a meal replaced.",
    freeDefault: 1,
    min: 0,
    max: 100,
  },
  "mealPlanner.customObjectives": {
    kind: "flag",
    label: "Custom planning goals",
    description: "Plan for a goal in your own words, beyond the standard goals.",
    freeDefault: false,
  },
  "vendor.listing": {
    kind: "flag",
    label: "Products recommended to users",
    description:
      "A verified vendor's verified products appear in recommendations and the product directory.",
    freeDefault: false,
  },
  "vendor.maxProducts": {
    kind: "number",
    label: "Products a vendor can list",
    description: "How many products a vendor business can have at once.",
    freeDefault: 3,
    min: 0,
    max: 10000,
  },
  "hospital.listing": {
    kind: "flag",
    label: "Listed in the hospital directory",
    description: "A verified hospital appears in search and can be booked.",
    freeDefault: false,
  },
  "hospital.maxStaff": {
    kind: "number",
    label: "Hospital staff accounts",
    description: "How many staff members a hospital can register.",
    freeDefault: 5,
    min: 1,
    max: 10000,
  },
  "nutritionist.listing": {
    kind: "flag",
    label: "Listed in the nutritionist directory",
    description: "A verified nutritionist appears in search and chat suggestions.",
    freeDefault: false,
  },
} as const satisfies Record<string, NumberEntitlement | FlagEntitlement>;

export type EntitlementKey = keyof typeof ENTITLEMENTS;
export type NumberKey = {
  [K in EntitlementKey]: (typeof ENTITLEMENTS)[K]["kind"] extends "number" ? K : never;
}[EntitlementKey];
export type FlagKey = Exclude<EntitlementKey, NumberKey>;

export type Entitlements = { [K in NumberKey]: number } & { [K in FlagKey]: boolean };

export const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENTS) as EntitlementKey[];

export function isEntitlementKey(value: string): value is EntitlementKey {
  return Object.hasOwn(ENTITLEMENTS, value);
}

export function freeDefaults(): Entitlements {
  return Object.fromEntries(
    ENTITLEMENT_KEYS.map((key) => [key, ENTITLEMENTS[key].freeDefault]),
  ) as Entitlements;
}

/**
 * Keeps only known keys with valid values. Stored JSON is never trusted:
 * a value outside its range or of the wrong type is dropped, not clamped.
 */
export function parseEntitlements(value: unknown): Partial<Entitlements> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isEntitlementKey(key)) continue;
    const spec: NumberEntitlement | FlagEntitlement = ENTITLEMENTS[key];
    if (spec.kind === "flag") {
      if (typeof raw === "boolean") out[key] = raw;
    } else {
      const parsed = z.number().int().min(spec.min).max(spec.max).safeParse(raw);
      if (parsed.success) out[key] = parsed.data;
    }
  }
  return out as Partial<Entitlements>;
}

/**
 * Reads entitlements from a form: number fields named "ent:<key>" (blank
 * means "not set") and checkboxes for flags. Returns the errors per key.
 */
export function entitlementsFromForm(
  formData: FormData,
): { ok: true; value: Partial<Entitlements> } | { ok: false; error: string } {
  const out: Record<string, number | boolean> = {};
  for (const key of ENTITLEMENT_KEYS) {
    const spec: NumberEntitlement | FlagEntitlement = ENTITLEMENTS[key];
    const raw = formData.get(`ent:${key}`);
    if (spec.kind === "flag") {
      out[key] = raw === "on";
      continue;
    }
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
      return {
        ok: false,
        error: `${spec.label} must be a whole number from ${spec.min} to ${spec.max}.`,
      };
    }
    out[key] = n;
  }
  return { ok: true, value: out as Partial<Entitlements> };
}

/**
 * Combines entitlements from several sources: the most generous value wins
 * (largest number, any flag that is on), so a second plan never takes
 * something away.
 */
export function mergeEntitlements(
  base: Entitlements,
  ...grants: Partial<Entitlements>[]
): Entitlements {
  const out: Record<string, number | boolean> = { ...base };
  for (const grant of grants) {
    for (const [key, value] of Object.entries(grant)) {
      const current = out[key];
      if (typeof value === "number" && typeof current === "number") {
        out[key] = Math.max(current, value);
      } else if (typeof value === "boolean") {
        out[key] = Boolean(current) || value;
      }
    }
  }
  return out as Entitlements;
}
