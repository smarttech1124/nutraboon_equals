import { describe, expect, it } from "vitest";
import { buildAliasIndex, findFoodMentions } from "@/lib/nutrition/match";
import { parseSeedFile } from "@/lib/nutrition/seed-data";
import { seed, seedJson } from "../helpers/seed-foods";

describe("prisma/seed/foods.json", () => {
  it("has provenance on every food", () => {
    for (const food of seed.foods) {
      expect(food.source, food.id).toMatch(/FAO\/INFOODS/);
      expect(food.sourceUrl, food.id).toMatch(/^https:\/\/www\.fao\.org\//);
      expect(food.sourceVersion, food.id).toContain("WAFCT 2019");
      expect(food.sourceFoodCode, food.id).toMatch(/^\d{2}_\d{3}$/);
      expect(food.retrievedAt, food.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(food.per100g.energyKcal, food.id).not.toBeNull();
      if (food.serving) {
        expect(food.serving.source, food.id).toContain("USDA");
        expect(food.serving.sourceRef, food.id).toMatch(/fdc_id \d+, food_portion id \d+/);
      }
    }
  });

  // CLAUDE.md §13 example list, as a user would type each food.
  it.each([
    ["orange", "orange"],
    ["banana", "banana"],
    ["apple", "apple"],
    ["mango", "mango"],
    ["pawpaw", "pawpaw"],
    ["papaya", "pawpaw"],
    ["watermelon", "watermelon"],
    ["tomato", "tomato"],
    ["spinach", "spinach"],
    ["rice", "rice-white-boiled"],
    ["beans", "beans-boiled"],
    ["garri", "gari"],
    ["gari", "gari"],
    ["yam", "yam-boiled"],
    ["sweet potato", "sweet-potato"],
    ["plantain", "plantain-ripe"],
    ["egg", "egg"],
    ["chicken", "chicken-breast"],
    ["sardine", "sardine-canned"],
    ["milk", "milk-whole"],
  ])("resolves %s", (typed, id) => {
    const index = buildAliasIndex(seed.aliases);
    expect(findFoodMentions(`What's in ${typed}?`, index)).toEqual([id]);
  });

  it("tags peanut-containing foods with the peanut allergen", () => {
    const peanut = seed.foods.filter((f) => f.allergens.includes("peanut")).map((f) => f.id);
    expect(peanut).toEqual(expect.arrayContaining(["groundnut", "groundnut-oil"]));
  });

  it("rejects an alias claimed by two foods", () => {
    const [first, second] = seedJson.foods;
    const clash = { foods: [first, { ...second, aliases: [first.aliases[0].toUpperCase()] }] };
    expect(() => parseSeedFile(clash)).toThrow(/used by both/);
  });

  it("rejects a food without provenance", () => {
    const [first] = seedJson.foods;
    expect(() => parseSeedFile({ foods: [{ ...first, sourceUrl: "" }] })).toThrow();
  });
});
