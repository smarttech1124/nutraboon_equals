import { describe, expect, it } from "vitest";
import { calculateNutrition, roundNutrient, scaleNutrients } from "@/lib/nutrition/calculate";
import { formatFoodFacts, toFoodReference } from "@/lib/nutrition/facts";
import { buildAliasIndex, findFoodMentions, normalizeText } from "@/lib/nutrition/match";
import { NUTRIENT_FIELDS, type NutrientValues } from "@/lib/nutrition/types";
import { seedFood } from "../helpers/seed-foods";

function nutrients(partial: Partial<NutrientValues>): NutrientValues {
  const base = {} as NutrientValues;
  for (const f of NUTRIENT_FIELDS) base[f] = partial[f] ?? null;
  return base;
}

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalizeText("  Ẹyin, PAWPAW!!  ")).toBe("eyin pawpaw");
    expect(normalizeText("black-eyed beans")).toBe("black eyed beans");
  });
});

describe("findFoodMentions", () => {
  const index = buildAliasIndex([
    { alias: "groundnut", foodId: "groundnut" },
    { alias: "groundnut oil", foodId: "groundnut-oil" },
    { alias: "orange", foodId: "orange" },
    { alias: "oranges", foodId: "orange" },
    { alias: "rice", foodId: "rice" },
    { alias: "egg", foodId: "egg" },
    { alias: "beans", foodId: "beans" },
  ]);

  it("prefers the longest matching phrase", () => {
    expect(findFoodMentions("Is groundnut oil healthy?", index)).toEqual(["groundnut-oil"]);
  });

  it("matches whole words only", () => {
    expect(findFoodMentions("I like eggplant and porridge", index)).toEqual([]);
  });

  it("returns distinct foods in the order mentioned, up to the limit", () => {
    expect(findFoodMentions("Oranges, rice, orange, beans and egg", index)).toEqual([
      "orange",
      "rice",
      "beans",
    ]);
    expect(findFoodMentions("rice and beans", index, 1)).toEqual(["rice"]);
  });
});

describe("scaleNutrients", () => {
  it("scales per-100 g values to a portion and keeps missing values null", () => {
    const result = scaleNutrients(nutrients({ energyKcal: 200, proteinG: 10 }), 50);
    expect(result.energyKcal).toBe(100);
    expect(result.proteinG).toBe(5);
    expect(result.vitaminCMg).toBeNull();
  });

  it("rejects negative or non-finite weights", () => {
    expect(() => scaleNutrients(nutrients({}), -1)).toThrow(RangeError);
    expect(() => scaleNutrients(nutrients({}), Number.NaN)).toThrow(RangeError);
  });
});

describe("calculateNutrition", () => {
  it("sums portions", () => {
    const total = calculateNutrition([
      { per100g: nutrients({ energyKcal: 100, proteinG: 2 }), grams: 200 },
      { per100g: nutrients({ energyKcal: 50, proteinG: 10 }), grams: 100 },
    ]);
    expect(total.energyKcal).toBe(250);
    expect(total.proteinG).toBe(14);
  });

  it("makes a total null when any portion lacks that nutrient", () => {
    const total = calculateNutrition([
      { per100g: nutrients({ energyKcal: 100, vitaminCMg: 10 }), grams: 100 },
      { per100g: nutrients({ energyKcal: 100 }), grams: 100 },
    ]);
    expect(total.energyKcal).toBe(200);
    expect(total.vitaminCMg).toBeNull();
  });

  it("returns zeros for an empty meal", () => {
    expect(calculateNutrition([]).energyKcal).toBe(0);
  });
});

describe("roundNutrient", () => {
  it.each([
    ["energyKcal", 57.64, 58],
    ["vitaminARaeMcg", 12.6, 13],
    ["proteinG", 0.917, 0.9],
    ["vitaminCMg", 60.26, 60],
    ["ironMg", 9.96, 10],
  ] as const)("rounds %s %d to %d", (field, value, expected) => {
    expect(roundNutrient(field, value)).toBe(expected);
  });
});

describe("formatFoodFacts", () => {
  it("states per-serving values calculated from the seed record, plus per 100 g", () => {
    const orange = seedFood("orange");
    const grams = orange.serving!.grams;
    const line = formatFoodFacts(orange);

    expect(line).toContain(`Per ${orange.serving!.label} (about ${Math.round(grams)} g)`);
    const kcal = Math.round((orange.per100g.energyKcal! * grams) / 100);
    expect(line).toContain(`energy ${kcal} kcal`);
    expect(line).toContain(`Per 100 g: energy ${orange.per100g.energyKcal} kcal`);
    expect(line).toContain(orange.sourceFoodName);
  });

  it("omits the serving part when no sourced serving exists", () => {
    const gari = seedFood("gari");
    expect(gari.serving).toBeNull();
    const line = formatFoodFacts(gari);
    expect(line).not.toMatch(/Per [^:]*\(about \d+ g\)/);
    expect(line).toContain("Per 100 g:");
  });

  it("names allergens", () => {
    expect(formatFoodFacts(seedFood("groundnut"))).toContain("Common allergen: peanut");
  });

  it("builds a reference with both sources for the browser", () => {
    expect(toFoodReference(seedFood("orange"))).toMatchObject({
      id: "orange",
      source: expect.stringContaining("FAO/INFOODS"),
      servingSource: expect.stringContaining("USDA"),
    });
  });
});
