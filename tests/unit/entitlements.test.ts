import { describe, expect, it } from "vitest";
import {
  entitlementsFromForm,
  freeDefaults,
  mergeEntitlements,
  parseEntitlements,
} from "@/lib/billing/entitlements";
import { InMemoryBillingRepository } from "@/lib/billing/repository";
import { EntitlementService, grantCounts, monthStart } from "@/lib/billing/service";
import { parseFeatureFlags, parseGraceDays, SETTING_KEYS } from "@/lib/billing/settings";

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const repo = new InMemoryBillingRepository();
  return { repo, service: new EntitlementService(repo, () => NOW) };
}

describe("entitlement parsing", () => {
  it("keeps known keys with valid values and drops the rest", () => {
    expect(
      parseEntitlements({
        "mealPlanner.maxDays": 7,
        "mealPlanner.plansPerMonth": -1,
        "mealPlanner.shoppingList": "yes",
        unknown: 5,
      }),
    ).toEqual({ "mealPlanner.maxDays": 7 });
    expect(parseEntitlements(null)).toEqual({});
    expect(parseEntitlements([1])).toEqual({});
  });

  it("merges to the most generous value", () => {
    const merged = mergeEntitlements(
      freeDefaults(),
      { "mealPlanner.maxDays": 7 },
      { "mealPlanner.maxDays": 31, "mealPlanner.shoppingList": true },
      { "mealPlanner.maxDays": 3, "mealPlanner.shoppingList": false },
    );
    expect(merged["mealPlanner.maxDays"]).toBe(31);
    expect(merged["mealPlanner.shoppingList"]).toBe(true);
  });

  it("reads form fields and rejects out-of-range numbers", () => {
    const ok = new FormData();
    ok.set("ent:mealPlanner.maxDays", "7");
    ok.set("ent:mealPlanner.shoppingList", "on");
    expect(entitlementsFromForm(ok)).toEqual({
      ok: true,
      value: {
        "mealPlanner.maxDays": 7,
        "mealPlanner.shoppingList": true,
        "mealPlanner.customObjectives": false,
        "chatHistory.enabled": false,
        "vendor.listing": false,
        "hospital.listing": false,
        "nutritionist.listing": false,
      },
    });
    const bad = new FormData();
    bad.set("ent:mealPlanner.maxDays", "400");
    expect(entitlementsFromForm(bad).ok).toBe(false);
  });
});

describe("settings parsing", () => {
  it("falls back to defaults for malformed values", () => {
    expect(parseGraceDays("3")).toBe(3);
    expect(parseGraceDays(99)).toBe(3);
    expect(parseGraceDays(0)).toBe(0);
    expect(parseFeatureFlags({ mealPlanner: true, vendors: "yes" })).toMatchObject({
      mealPlanner: true,
      vendors: false,
      hospitals: false,
    });
  });
});

describe("grantCounts", () => {
  const active = { status: "active" as const, graceUntil: null, entitlements: {} };
  it("counts an active subscription until its period end plus grace days", () => {
    expect(
      grantCounts({ ...active, currentPeriodEnd: new Date(NOW.getTime() + DAY) }, NOW, 0),
    ).toBe(true);
    expect(
      grantCounts({ ...active, currentPeriodEnd: new Date(NOW.getTime() - DAY) }, NOW, 0),
    ).toBe(false);
    expect(
      grantCounts({ ...active, currentPeriodEnd: new Date(NOW.getTime() - DAY) }, NOW, 3),
    ).toBe(true);
    expect(grantCounts({ ...active, currentPeriodEnd: null }, NOW, 3)).toBe(false);
  });

  it("counts past-due only until its grace date and never pending or canceled", () => {
    const base = { currentPeriodEnd: null, entitlements: {} };
    expect(
      grantCounts({ ...base, status: "past_due", graceUntil: new Date(NOW.getTime() + 1) }, NOW, 0),
    ).toBe(true);
    expect(
      grantCounts({ ...base, status: "past_due", graceUntil: new Date(NOW.getTime() - 1) }, NOW, 0),
    ).toBe(false);
    const future = new Date(NOW.getTime() + DAY);
    expect(
      grantCounts(
        { ...base, status: "pending", currentPeriodEnd: future, graceUntil: future },
        NOW,
        3,
      ),
    ).toBe(false);
    expect(
      grantCounts(
        { ...base, status: "canceled", currentPeriodEnd: future, graceUntil: future },
        NOW,
        3,
      ),
    ).toBe(false);
  });
});

describe("monthStart", () => {
  it("uses the Lagos calendar month", () => {
    expect(monthStart(NOW).toISOString()).toBe("2026-09-30T23:00:00.000Z");
    // 23:30 UTC on 31 October is already 1 November in Lagos.
    expect(monthStart(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe(
      "2026-10-31T23:00:00.000Z",
    );
  });
});

describe("EntitlementService", () => {
  it("gives anonymous visitors the free tier, with admin overrides", async () => {
    const { repo, service } = setup();
    expect((await service.entitlementsFor(null))["mealPlanner.maxDays"]).toBe(2);
    repo.settings.set(SETTING_KEYS.freeEntitlements, { "mealPlanner.maxDays": 1, bogus: 9 });
    expect((await service.entitlementsFor(null))["mealPlanner.maxDays"]).toBe(1);
  });

  it("adds the plans of counting subscriptions only", async () => {
    const { repo, service } = setup();
    repo.grants.set("user:u1", [
      {
        status: "active",
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
        graceUntil: null,
        entitlements: { "mealPlanner.maxDays": 7 },
      },
      {
        status: "active",
        currentPeriodEnd: new Date(NOW.getTime() - 10 * DAY),
        graceUntil: null,
        entitlements: { "mealPlanner.maxDays": 366 },
      },
    ]);
    expect((await service.entitlementsFor({ userId: "u1" }))["mealPlanner.maxDays"]).toBe(7);
    expect((await service.entitlementsFor({ userId: "u2" }))["mealPlanner.maxDays"]).toBe(2);
  });

  it("stops consuming at the monthly limit", async () => {
    const { repo, service } = setup();
    repo.settings.set(SETTING_KEYS.freeEntitlements, { "mealPlanner.plansPerMonth": 2 });
    const subject = { userId: "u1" };
    expect(await service.consume(subject, "mealPlans")).toEqual({ ok: true, used: 1, limit: 2 });
    expect(await service.consume(subject, "mealPlans")).toEqual({ ok: true, used: 2, limit: 2 });
    expect(await service.consume(subject, "mealPlans")).toEqual({ ok: false, used: 2, limit: 2 });
    expect(await service.usage(subject, "mealPlans")).toEqual({ used: 2, limit: 2 });
  });

  it("reads feature flags, all off by default", async () => {
    const { repo, service } = setup();
    expect(await service.isEnabled("mealPlanner")).toBe(false);
    repo.settings.set(SETTING_KEYS.features, { mealPlanner: true });
    expect(await service.isEnabled("mealPlanner")).toBe(true);
  });
});
