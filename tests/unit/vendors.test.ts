import { describe, expect, it } from "vitest";
import {
  findClaims,
  isBreastMilkSubstitute,
  productAllergens,
  productProblems,
  readProductForm,
} from "@/lib/vendors/product";
import { isSafeFor, matchedTerm, recommend, type Candidate } from "@/lib/vendors/recommend";

function form(values: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) for (const item of [v].flat()) f.append(k, item);
  return f;
}

const valid = {
  name: "Farm Fresh Plain Yogurt 500ml",
  category: "dairy",
  description: "Plain set yogurt made from fresh cow milk in Jos.",
  benefits: "A source of protein and calcium.",
  recommendedUse: "With fruit at breakfast.",
  ingredients: "Pasteurised milk, live cultures",
  matchTerms: "yogurt, yoghurt",
  availability: "in_stock",
  priceNaira: "1800",
  "label:basis": "100g",
  "label:energyKcal": "61",
  "label:proteinG": "3.5",
  "loc:0:kind": "store",
  "loc:0:name": "Shoprite Ikeja",
  "loc:0:state": "lagos",
  "loc:0:city": "Ikeja",
  "loc:1:kind": "online",
  "loc:1:name": "Our shop",
  "loc:1:url": "https://shop.example.test/yogurt",
};

describe("product form (ADR-067)", () => {
  it("validates, normalises and detects allergens from ingredients", () => {
    const result = readProductForm(form(valid));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      matchTerms: ["yogurt", "yoghurt"],
      allergens: ["milk"],
      priceNaira: 1800,
      labelNutrition: { basis: "100g", energyKcal: 61, proteinG: 3.5, fatG: null },
    });
    expect(result.value.purchaseLocations).toEqual([
      { kind: "store", name: "Shoprite Ikeja", state: "Lagos", city: "Ikeja", url: null },
      {
        kind: "online",
        name: "Our shop",
        state: null,
        city: null,
        url: "https://shop.example.test/yogurt",
      },
    ]);
  });

  it("rejects non-https links, bad labels and unknown categories", () => {
    expect(readProductForm(form({ ...valid, "loc:1:url": "http://shop.example.test" })).ok).toBe(
      false,
    );
    expect(readProductForm(form({ ...valid, "label:energyKcal": "lots" })).ok).toBe(false);
    expect(readProductForm(form({ ...valid, category: "medicine" })).ok).toBe(false);
  });

  it("falls back to the product name as its match term", () => {
    const result = readProductForm(form({ ...valid, matchTerms: "" }));
    expect(result.ok && result.value.matchTerms).toEqual(["farm fresh plain yogurt 500ml"]);
  });
});

describe("claims and banned products", () => {
  it("finds treatment claims and disease mentions", () => {
    expect(
      findClaims({ benefits: "Cures malaria and boosts immunity" }).map((c) => c.term),
    ).toEqual(expect.arrayContaining(["cures", "malaria"]));
    expect(findClaims({ benefits: "Good for diabetes" })).toHaveLength(1);
    expect(findClaims({ benefits: "Soothes stomach ulcers" }).map((c) => c.term)).toEqual([
      "ulcers",
    ]);
    expect(findClaims({ benefits: "Lose 5kg in a week!" })).toHaveLength(1);
    expect(findClaims({ benefits: "A source of protein and calcium." })).toEqual([]);
  });

  it("blocks breast-milk substitutes entirely", () => {
    expect(isBreastMilkSubstitute("SuperBaby Infant Formula Stage 1", [], "")).toBe(true);
    expect(isBreastMilkSubstitute("Growing-up milk 1-3 years", [], "")).toBe(true);
    expect(isBreastMilkSubstitute("Plain yogurt", ["milk"], "")).toBe(false);
  });

  it("lists every problem that stops a submission", () => {
    expect(
      productProblems({
        name: "Infant formula",
        description: "short",
        benefits: "Treats colic",
        recommendedUse: "",
        ingredients: [],
        purchaseLocations: [],
      }),
    ).toHaveLength(5);
    const ok = readProductForm(form(valid));
    expect(ok.ok && productProblems(ok.value)).toEqual([]);
  });

  it("keeps declared allergens and adds detected ones", () => {
    expect(productAllergens(["egg"], "Groundnut cookies", ["wheat flour", "groundnut"])).toEqual(
      expect.arrayContaining(["egg", "peanut"]),
    );
  });
});

describe("recommendation engine", () => {
  const yogurt: Candidate = {
    id: "y",
    name: "Plain yogurt",
    ingredients: ["milk", "cultures"],
    allergens: ["milk"],
    matchTerms: ["yogurt"],
    availability: "in_stock",
    states: ["Lagos"],
    online: false,
  };
  const groundnuts: Candidate = {
    id: "g",
    name: "Roasted groundnuts",
    ingredients: ["groundnuts", "salt"],
    allergens: ["peanut"],
    matchTerms: ["groundnut", "groundnuts"],
    availability: "in_stock",
    states: [],
    online: true,
  };
  const oats: Candidate = {
    id: "o",
    name: "Rolled oats",
    ingredients: ["oats"],
    allergens: [],
    matchTerms: ["oats", "rolled oats"],
    availability: "in_stock",
    states: [],
    online: true,
  };

  it("only offers products that are foods already suggested", () => {
    expect(matchedTerm(yogurt, ["plain yogurt with fruit"])).toBe("plain yogurt with fruit");
    expect(matchedTerm(yogurt, ["rice", "beans"])).toBeUndefined();
    expect(recommend([yogurt, oats], { terms: [], allergies: [] })).toEqual([]);
  });

  it("never offers a product that conflicts with allergies, avoided foods or child rules", () => {
    expect(isSafeFor(yogurt, { terms: [], allergies: ["milk"] })).toBe(false);
    expect(isSafeFor(groundnuts, { terms: [], allergies: [], childUnder5: true })).toBe(false);
    expect(isSafeFor(oats, { terms: [], allergies: [], avoidFoods: ["oats"] })).toBe(false);
    expect(isSafeFor(oats, { terms: [], allergies: ["milk"] })).toBe(true);
  });

  it("prefers the user's state, then online, one product per food, within the limit", () => {
    const lagosOats = { ...oats, id: "o2", states: ["Lagos"], online: false };
    const out = recommend([oats, lagosOats, yogurt, { ...yogurt, id: "y2" }], {
      terms: ["oats", "yogurt"],
      allergies: [],
      state: "Lagos",
      limit: 3,
    });
    expect(out.map((o) => o.candidate.id)).toEqual(["o2", "y"]);
    expect(
      recommend([oats, yogurt], { terms: ["oats", "yogurt"], allergies: [], limit: 1 }),
    ).toHaveLength(1);
    expect(
      recommend([{ ...oats, availability: "out_of_stock" }], { terms: ["oats"], allergies: [] }),
    ).toEqual([]);
  });
});
