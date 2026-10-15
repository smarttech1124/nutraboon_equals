import { describe, expect, it } from "vitest";
import { parseEntitlements } from "@/lib/billing/entitlements";
import { STATES } from "@/lib/budget/regions";
import {
  DEMO_HOSPITALS,
  DEMO_NUTRITIONISTS,
  DEMO_PLANS,
  DEMO_VENDORS,
  demoEmail,
} from "@/lib/demo/data";
import { inNigeria } from "@/lib/geo/distance";
import { isAccessService } from "@/lib/hospitals/accessibility";
import { parseAvailability } from "@/lib/nutritionists/availability";
import { isSpecialization } from "@/lib/nutritionists/specializations";
import { ALLERGEN_KEYS } from "@/lib/safety/allergens";
import { isProductCategory } from "@/lib/vendors/categories";
import { parseLocations, productProblems } from "@/lib/vendors/product";

/** The demonstration data is complete and passes the app's own rules (ADR-074). */

const unique = (values: string[]) => new Set(values).size === values.length;

describe("demo data", () => {
  it("has at least 5 nutritionists, vendors and hospitals and 3 plans for people", () => {
    expect(DEMO_NUTRITIONISTS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_VENDORS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_HOSPITALS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_PLANS.filter((p) => p.audience === "user").length).toBeGreaterThanOrEqual(3);
  });

  it("uses unique keys and only reserved example domains", () => {
    expect(unique(DEMO_NUTRITIONISTS.map((n) => n.key))).toBe(true);
    expect(unique(DEMO_VENDORS.map((v) => v.key))).toBe(true);
    expect(unique(DEMO_VENDORS.flatMap((v) => v.products.map((p) => p.key)))).toBe(true);
    expect(unique(DEMO_HOSPITALS.flatMap((h) => h.departments.map((d) => d.key)))).toBe(true);
    expect(unique(DEMO_PLANS.map((p) => p.code))).toBe(true);
    expect(demoEmail("x")).toMatch(/@example\.test$/);
    for (const v of DEMO_VENDORS)
      for (const p of v.products)
        for (const w of p.where) if (w.url) expect(new URL(w.url).hostname).toBe("example.com");
  });

  it("marks every business as a sample", () => {
    for (const org of [...DEMO_VENDORS, ...DEMO_HOSPITALS]) expect(org.name).toMatch(/\(Sample\)$/);
  });

  it("gives plans valid, distinct entitlements", () => {
    for (const p of DEMO_PLANS) {
      expect(parseEntitlements(p.entitlements)).toEqual(p.entitlements);
      expect(p.priceMinor).toBeGreaterThan(0);
    }
    const userPlans = DEMO_PLANS.filter((p) => p.audience === "user").map((p) =>
      JSON.stringify(p.entitlements),
    );
    expect(unique(userPlans)).toBe(true);
    for (const audience of ["nutritionist", "vendor", "hospital"] as const) {
      const key = `${audience}.listing`;
      expect(DEMO_PLANS.some((p) => p.audience === audience && p.entitlements[key] === true)).toBe(
        true,
      );
    }
  });

  it("gives nutritionists valid specialisations, states and availability", () => {
    for (const n of DEMO_NUTRITIONISTS) {
      expect(n.specializations.every(isSpecialization)).toBe(true);
      expect(STATES).toContain(n.state);
      expect(parseAvailability(n.availability)).toHaveLength(n.availability.length);
      expect(n.qualifications.length).toBeGreaterThan(0);
    }
  });

  it("gives vendors products that pass the review checks", () => {
    for (const v of DEMO_VENDORS) {
      expect(STATES).toContain(v.state);
      expect(v.categories.every(isProductCategory)).toBe(true);
      for (const p of v.products) {
        expect(isProductCategory(p.category)).toBe(true);
        expect(p.allergens.every((a) => (ALLERGEN_KEYS as string[]).includes(a))).toBe(true);
        expect(parseLocations(p.where)).toHaveLength(p.where.length);
        expect(productProblems({ ...p, purchaseLocations: p.where })).toEqual([]);
      }
    }
  });

  it("places hospitals in Nigeria with valid services and departments", () => {
    for (const h of DEMO_HOSPITALS) {
      expect(inNigeria(h)).toBe(true);
      expect(STATES).toContain(h.state);
      expect(h.accessibility.every(isAccessService)).toBe(true);
      expect(h.departments.length).toBeGreaterThan(0);
      for (const d of h.departments)
        expect(parseAvailability(d.availability).length).toBeGreaterThan(0);
    }
  });
});
