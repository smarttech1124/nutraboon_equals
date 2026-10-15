import { describe, expect, it, vi } from "vitest";

const db = {
  hospitalProfile: { findUnique: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  product: { findUnique: vi.fn() },
  nutritionistProfile: { findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ getPrisma: () => db }));
vi.mock("@/lib/billing", () => ({ getEntitlementService: () => undefined }));

const { hospitalListing, nutritionistListing, productListing, vendorListing, LISTING_REASON_TEXT } =
  await import("@/lib/directory/visibility");

function service(on: boolean, entitlements: Record<string, boolean>) {
  return {
    isEnabled: vi.fn(async () => on),
    entitlementsFor: vi.fn(async () => entitlements),
  } as never;
}

describe("public listing status (ADR-082)", () => {
  it("lists a verified hospital with a listing plan while the module is on", async () => {
    db.hospitalProfile.findUnique.mockResolvedValue({ status: "verified" });
    expect(await hospitalListing("h1", service(true, { "hospital.listing": true }))).toEqual({
      listed: true,
      reasons: [],
    });
  });

  it("names every missing condition", async () => {
    db.hospitalProfile.findUnique.mockResolvedValue({ status: "submitted" });
    expect(await hospitalListing("h1", service(false, {}))).toEqual({
      listed: false,
      reasons: ["module_off", "not_verified", "no_listing_plan"],
    });
  });

  it("explains a verified vendor with no plan, and its products through the vendor", async () => {
    db.vendorProfile.findUnique.mockResolvedValue({ status: "verified" });
    db.product.findUnique.mockResolvedValue({ status: "verified", organizationId: "v1" });
    const s = service(true, {});
    expect((await vendorListing("v1", s)).reasons).toEqual(["no_listing_plan"]);
    expect((await productListing("p1", s)).reasons).toEqual(["vendor_not_listed"]);
  });

  it("does not list a suspended nutritionist account", async () => {
    db.nutritionistProfile.findUnique.mockResolvedValue({
      status: "verified",
      user: { status: "suspended" },
    });
    const status = await nutritionistListing("n1", service(true, { "nutritionist.listing": true }));
    expect(status.reasons).toEqual(["account_suspended"]);
    expect(LISTING_REASON_TEXT.module_off).toMatch(/Coming soon/);
  });
});
