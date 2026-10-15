import { describe, expect, it } from "vitest";
import {
  allergyNotice,
  detectDeclaredAllergies,
  findAllergenTerms,
  findConflictingMentions,
  validateReply,
} from "@/lib/safety/allergy";
import { seed } from "../helpers/seed-foods";

describe("detectDeclaredAllergies", () => {
  it.each([
    ["My youngest is allergic to peanuts.", ["peanut"]],
    ["She has a groundnut allergy", ["peanut"]],
    ["He can't eat eggs or fish", ["egg", "fish"]],
    ["I'm lactose intolerant", ["milk"]],
    ["Allergic to nuts", ["peanut", "tree_nut"]],
    ["We avoid seafood at home", ["fish", "crustacean"]],
    ["My son reacts to crayfish", ["crustacean"]],
    ["She's not allergic to anything except sesame", ["sesame"]],
  ])("%s → %j", (message, expected) => {
    expect(detectDeclaredAllergies(message).sort()).toEqual([...expected].sort());
  });

  it.each([
    "No allergies.",
    "She isn't allergic to eggs.",
    "We have rice, beans and groundnut oil.",
    "Is groundnut good for children?",
    "We don't have any allergies in the family",
  ])("declares nothing for %j", (message) => {
    expect(detectDeclaredAllergies(message)).toEqual([]);
  });
});

describe("findAllergenTerms", () => {
  it("prefers longer phrases so labels stay accurate", () => {
    expect(findAllergenTerms("peanut butter").map((m) => m.allergens)).toEqual([["peanut"]]);
    expect(findAllergenTerms("soy milk").map((m) => m.allergens)).toEqual([["soy"]]);
  });

  it.each(["garden egg stew", "coconut milk rice", "tiger nut drink", "eggplant"])(
    "does not flag %j",
    (text) => {
      expect(findAllergenTerms(text)).toEqual([]);
    },
  );

  it("knows local and product names", () => {
    const keys = (text: string) => findAllergenTerms(text).flatMap((m) => m.allergens);
    expect(keys("suya")).toEqual(["peanut"]);
    expect(keys("kuli kuli")).toEqual(["peanut"]);
    expect(keys("semovita")).toEqual(["wheat"]);
    expect(keys("ede")).toEqual(["crustacean"]);
  });
});

describe("findConflictingMentions", () => {
  it("finds conflicting foods but not the declaration itself", () => {
    const mentions = findConflictingMentions(
      "My youngest is allergic to peanuts. We have rice, beans, eggs, plantain and groundnut oil.",
      ["peanut"],
    );
    expect(mentions.map((m) => m.term)).toEqual(["groundnut oil"]);
  });
});

describe("validateReply", () => {
  const peanut = ["peanut"];

  it("rejects a recommended food containing the allergen", () => {
    const violations = validateReply(
      { message: "Here is a plan.", recommendedFoods: ["rice", "fried plantain in groundnut oil"] },
      peanut,
    );
    expect(violations).toEqual([
      { allergen: "peanut", term: "groundnut oil", where: "recommendedFoods" },
    ]);
  });

  it.each([
    "Fry the plantain in groundnut oil.",
    "Don't forget to add groundnut paste to the soup.",
    "Sprinkle some yaji on the beef.",
    "No problem, add peanuts for crunch.",
  ])("rejects a message that suggests the allergen: %j", (message) => {
    expect(validateReply({ message }, peanut)).not.toEqual([]);
  });

  it.each([
    "I left out groundnut oil because of the peanut allergy.",
    "Use palm oil instead of groundnut oil.",
    "Cook the plantain without groundnut oil.",
    "Groundnut oil is unsafe for her, so we'll use palm oil.",
    "Choose peanut-free snacks.",
    "Avoid groundnut paste and kuli kuli.",
  ])("allows a message that excludes the allergen: %j", (message) => {
    expect(validateReply({ message, recommendedFoods: ["palm oil", "plantain"] }, peanut)).toEqual(
      [],
    );
  });

  it("checks nothing when no allergy is declared", () => {
    expect(validateReply({ message: "Add groundnut oil." }, [])).toEqual([]);
  });
});

describe("allergyNotice", () => {
  it("names the conflicting food the user mentioned", () => {
    const mentions = findConflictingMentions("We have groundnut oil", ["peanut"]);
    expect(allergyNotice(["peanut"], mentions, true)).toBe(
      "Heads-up: groundnut oil contains peanut, which you said must be avoided, so it's left out.",
    );
  });

  it("states the exclusion when foods are suggested", () => {
    expect(allergyNotice(["peanut", "egg"], [], true)).toBe(
      "Leaving out peanut and egg because you said they must be avoided.",
    );
  });

  it("stays quiet when nothing is suggested or no allergy is declared", () => {
    expect(allergyNotice(["peanut"], [], false)).toBeUndefined();
    expect(allergyNotice([], [], true)).toBeUndefined();
  });
});

describe("vocabulary covers the food database", () => {
  // Every alias of a food tagged with an allergen must be caught by the
  // vocabulary, so allergy checks never depend on the database being up.
  const tagged = seed.foods.flatMap((f) => f.allergens.map((a) => ({ food: f, allergen: a })));

  it.each(tagged.map(({ food, allergen }) => [food.id, allergen, food] as const))(
    "%s aliases all map to %s",
    (_id, allergen, food) => {
      for (const alias of food.aliases) {
        const found = findAllergenTerms(alias).flatMap((m) => m.allergens);
        expect(found, alias).toContain(allergen);
      }
    },
  );
});
