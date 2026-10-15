import { describe, expect, it } from "vitest";
import {
  calculateRemainingBudget,
  calculateShoppingTotal,
  costShoppingList,
  roundNaira,
  validateBudget,
} from "@/lib/budget/calculate";
import { detectBudget, extractNairaAmounts, unverifiedAmounts } from "@/lib/budget/money";
import { parsePriceSeed } from "@/lib/budget/prices";
import { canonicalState, detectState, STATES, zoneOfState } from "@/lib/budget/regions";
import { buildBudgetSummary, formatPriceFacts, monthLabel } from "@/lib/budget/summary";
import { estimate, priceBook, priceJson, prices } from "../helpers/seed-prices";

describe("budget arithmetic", () => {
  it("validates budgets", () => {
    expect(validateBudget(2000)).toBe(true);
    expect(validateBudget(0)).toBe(false);
    expect(validateBudget(-5)).toBe(false);
    expect(validateBudget(Number.NaN)).toBe(false);
  });

  it("totals lines and works out what is left", () => {
    const total = calculateShoppingTotal([{ cost: 406.62 }, { cost: 390.14 }]);
    expect(total).toBeCloseTo(796.76, 2);
    expect(calculateRemainingBudget(2000, total)).toBeCloseTo(1203.24, 2);
    expect(calculateRemainingBudget(500, total)).toBeLessThan(0);
  });

  it("rounds estimates to the nearest ₦10", () => {
    expect(roundNaira(813.24)).toBe(810);
    expect(roundNaira(1345)).toBe(1350);
  });
});

describe("costShoppingList", () => {
  const book = priceBook("national");

  it("prices items by name and quantity from the seed estimates", () => {
    const costed = costShoppingList(
      [
        { item: "garri", quantity: 0.5 },
        { item: "Tomatoes", quantity: 0.25 },
      ],
      book,
    );
    expect(costed.lines.map((l) => [l.itemId, l.cost])).toEqual([
      ["garri-white-1kg", estimate("garri-white-1kg") * 0.5],
      ["tomatoes-1kg", estimate("tomatoes-1kg") * 0.25],
    ]);
    expect(costed.total).toBeCloseTo(
      estimate("garri-white-1kg") * 0.5 + estimate("tomatoes-1kg") * 0.25,
      6,
    );
    expect(costed.unpriced).toEqual([]);
  });

  it("reports items without an estimate instead of guessing", () => {
    const costed = costShoppingList(
      [
        { item: "rice", quantity: 1 },
        { item: "eggs", quantity: 0.2 },
      ],
      book,
    );
    expect(costed.unpriced).toEqual(["rice"]);
    expect(costed.total).toBeCloseTo(estimate("eggs-crate-30") * 0.2, 6);
  });

  it("rejects zero and implausible quantities", () => {
    const costed = costShoppingList(
      [
        { item: "onions", quantity: 0 },
        { item: "yam", quantity: 500 },
      ],
      book,
    );
    expect(costed.lines).toEqual([]);
    expect(costed.unpriced).toEqual(["onions", "yam"]);
  });

  it("uses zone prices when a zone is chosen", () => {
    const sw = costShoppingList([{ item: "beans", quantity: 1 }], priceBook("south_west"));
    expect(sw.total).toBe(estimate("beans-brown-1kg", "south_west"));
    expect(sw.total).not.toBe(estimate("beans-brown-1kg", "national"));
  });
});

describe("money in text", () => {
  it.each([
    ["I have ₦2,000", [2000]],
    ["I have N2000 and N 1,500", [2000, 1500]],
    ["about 3k naira", [3000]],
    ["₦1,560.56 per kg", [1560.56]],
    ["Use N5 of salt", []],
  ])("extracts amounts from %j", (text, expected) => {
    expect(extractNairaAmounts(text)).toEqual(expected);
  });

  it("detects a stated budget, but not a price question", () => {
    expect(detectBudget("I have ₦2,000. What can I cook tonight?")).toBe(2000);
    expect(detectBudget("My budget is 5000 naira")).toBe(5000);
    expect(detectBudget("Is ₦1,500 a fair price for garri?")).toBeUndefined();
  });

  it("flags amounts the app did not supply", () => {
    expect(unverifiedAmounts("With ₦2,000 you could buy garri for ₦810.", [2000, 813.24])).toEqual(
      [],
    );
    expect(unverifiedAmounts("That will cost about ₦1,200 in total.", [2000, 813.24])).toEqual([
      1200,
    ]);
  });
});

describe("regions", () => {
  it("maps all 36 states and the FCT to a zone", () => {
    expect(STATES).toHaveLength(37);
    for (const state of STATES) expect(zoneOfState(state), state).toBeDefined();
  });

  it.each([
    ["I live in Lagos", "Lagos"],
    ["We're in Port Harcourt", "Rivers"],
    ["I'm based in Abuja", "FCT"],
    ["from Cross River state", "Cross River"],
    ["I stay in Ibadan", "Oyo"],
  ])("detects %j as %s", (message, state) => {
    expect(detectState(message)).toBe(state);
    expect(zoneOfState(state)).toBeDefined();
  });

  it("ignores place names that are not about where the user is", () => {
    expect(detectState("Is Niger rice good?")).toBeUndefined();
    expect(detectState("I like Lagos-style stew")).toBeUndefined();
  });

  it("canonicalises city names and rejects unknown places", () => {
    expect(canonicalState("port harcourt")).toBe("Rivers");
    expect(canonicalState("London")).toBeUndefined();
    expect(zoneOfState("Lagos")).toBe("south_west");
    expect(zoneOfState("Kano")).toBe("north_west");
  });
});

describe("budget summary", () => {
  it("rounds for display and says what is left", () => {
    const summary = buildBudgetSummary([{ item: "garri", quantity: 0.5 }], priceBook(), {
      budget: 2000,
      fromHome: ["beans"],
    });
    const cost = estimate("garri-white-1kg") * 0.5;
    expect(summary.estimatedTotal).toBe(roundNaira(cost));
    expect(summary.estimatedRemaining).toBe(roundNaira(2000 - cost));
    expect(summary.priceSource).toBe(
      `NBS Selected Food Price Watch, ${monthLabel(prices.seed.effectiveMonth)}`,
    );
    expect(summary.regionLabel).toBe("national average");
    expect(summary.fromHome).toEqual(["beans"]);
  });

  it("gives the model every estimate, labelled as an estimate", () => {
    const lines = formatPriceFacts(priceBook("south_west"));
    expect(lines[0]).toContain("South West average");
    expect(lines[0]).toContain("estimates, not current market prices");
    expect(lines).toHaveLength(prices.seed.items.length + 1);
  });
});

describe("prisma/seed/prices.json", () => {
  it("records provenance and a documented unit for every item", () => {
    expect(prices.seed.source).toContain("National Bureau of Statistics");
    expect(prices.seed.sourceUrl).toMatch(/^https:\/\/microdata\.nigerianstat\.gov\.ng\//);
    expect(prices.seed.effectiveMonth).toMatch(/^\d{4}-\d{2}$/);
    for (const item of prices.seed.items) {
      expect(item.unitEvidence, item.id).not.toBe("");
      expect(Object.keys(item.estimates).sort(), item.id).toEqual([
        "national",
        "north_central",
        "north_east",
        "north_west",
        "south_east",
        "south_south",
        "south_west",
      ]);
    }
  });

  it("rejects an alias claimed by two items", () => {
    const [a, b] = priceJson.items;
    const clash = { ...priceJson, items: [a, { ...b, aliases: [a.aliases[0]] }] };
    expect(() => parsePriceSeed(clash)).toThrow(/used by both/);
  });
});

describe("budget summary rounding", () => {
  it("shows a total equal to the sum of the shown lines", () => {
    const summary = buildBudgetSummary(
      [
        { item: "garri", quantity: 0.5 },
        { item: "tomatoes", quantity: 0.25 },
        { item: "onions", quantity: 0.25 },
      ],
      priceBook("south_west"),
      { budget: 2000 },
    );
    const lineSum = summary.purchases.reduce((sum, p) => sum + p.estimatedCost, 0);
    expect(summary.estimatedTotal).toBe(lineSum);
    expect(summary.estimatedRemaining).toBe(2000 - lineSum);
  });
});
