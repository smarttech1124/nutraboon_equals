import { describe, expect, it } from "vitest";
import {
  conversationHints,
  isSchoolMessage,
  knownFactLines,
  mergeProfile,
  SCHOOL_HINT,
} from "@/lib/conversation/profile";
import { findUnverifiedVitamins, nutrientAmounts } from "@/lib/nutrition/vocabulary";
import { checkMedicalRules, isUserStatedDose } from "@/lib/safety/medical-rules";
import { checkNutrientClaims } from "@/lib/safety/nutrient-claims";
import { checkReply } from "@/lib/safety/reply-check";

describe("nutrient names and figures (ADR-055)", () => {
  const verifiedData = "Orange: Per 1 medium (about 131 g): energy 62 kcal, vitamin C 70 mg.";

  it("allows nutrients we hold no data for, in general terms", () => {
    expect(
      checkNutrientClaims("Eggs also give choline and vitamin B12, and some iodine.", {
        verifiedData: "",
        conversationText: "",
      }),
    ).toEqual([]);
  });

  it("blocks vitamin names that are not real nutrients", () => {
    expect(findUnverifiedVitamins("Apricot kernels have vitamin B17 and vitamin P.")).toEqual([
      "vitamin B17",
      "vitamin P",
    ]);
    expect(findUnverifiedVitamins("Vitamins A and C, vitamin B12 and vitamin D.")).toEqual([]);
    const violations = checkNutrientClaims("This is full of vitamin B17.", {
      verifiedData: "",
      conversationText: "",
    });
    expect(violations).toEqual([
      expect.objectContaining({ kind: "nutrition", term: "vitamin B17" }),
    ]);
  });

  it("blocks nutrition figures that are not in verified data, but allows rounding", () => {
    expect(
      checkNutrientClaims("An orange has about 60 kcal and 70 mg of vitamin C.", {
        verifiedData,
        conversationText: "",
      }),
    ).toEqual([]);
    const invented = checkNutrientClaims("A banana has about 105 kcal and 12 g of sugar.", {
      verifiedData,
      conversationText: "",
    });
    expect(invented.map((v) => v.term)).toEqual(["105 kcal", "12 g"]);
  });

  it("accepts figures from earlier turns and leaves portion weights alone", () => {
    expect(
      checkNutrientClaims("As I said, that orange gives about 62 kcal. Cook 500 g of rice.", {
        verifiedData: "",
        conversationText: "An orange gives about 62 kcal.",
      }),
    ).toEqual([]);
    expect(nutrientAmounts("Use 500 g of rice and 2 g of protein")).toEqual(["2 g"]);
  });
});

describe("medication literacy (ADR-055)", () => {
  const userText = "The clinic gave me folic acid 5 mg tablets, one daily. What does that mean?";

  it("lets the reply repeat a dose the user stated", () => {
    expect(isUserStatedDose("Take your 5 mg folic acid tablet once a day.", userText)).toBe(true);
    expect(
      checkMedicalRules(
        {
          message: "Your 5 mg folic acid tablet is taken once a day, as the clinic said.",
          suggested: [],
        },
        { userText },
      ),
    ).toEqual([]);
  });

  it("still blocks a dose the user did not give, and any change to the medicine", () => {
    const other = checkMedicalRules(
      { message: "You could take 400 mcg of folic acid instead.", suggested: [] },
      { userText },
    );
    expect(other.map((v) => v.kind)).toEqual(["medication"]);
    const change = checkMedicalRules(
      { message: "You can stop the folic acid tablets after the first trimester.", suggested: [] },
      { userText },
    );
    expect(change.map((v) => v.kind)).toEqual(["medication"]);
  });
});

describe("constraints the user gives (ADR-055)", () => {
  it("replaces the kitchen with what the user has now, and remembers what they cannot afford", () => {
    const monday = mergeProfile({}, { availableIngredients: ["rice", "beans", "eggs"] });
    const wednesday = mergeProfile(monday, {
      ingredientsNow: ["leftover beans", "bread", "eggs", "banana"],
      unaffordableFoods: ["chicken"],
      cookingMinutes: 20,
      hasFridge: false,
    });
    expect(wednesday.availableIngredients).toEqual(["leftover beans", "bread", "eggs", "banana"]);
    expect(wednesday).not.toHaveProperty("ingredientsNow");
    expect(wednesday.unaffordableFoods).toEqual(["chicken"]);
    const facts = knownFactLines(wednesday, [])[0];
    expect(facts).toContain("Cannot afford right now: chicken.");
    expect(facts).toContain("Time to cook: about 20 minutes.");
    expect(facts).toContain("No fridge");
  });

  it("never suggests a food the family cannot afford", () => {
    const violations = checkReply(
      { message: "Try this.", recommendedFoods: ["rice"], planItems: ["Chicken stew", "chicken"] },
      { allergies: [], unaffordableFoods: ["chicken"] },
    );
    expect(violations.map((v) => v.kind)).toEqual(["avoid", "avoid"]);
    expect(violations[0].reason).toMatch(/cannot afford chicken/);
  });
});

it("lets the reply discuss a made-up vitamin the user asked about", () => {
  expect(
    checkNutrientClaims("Vitamin B17 is not a real vitamin, and apricot seeds can be harmful.", {
      verifiedData: "",
      conversationText: "Is vitamin B17 in apricot seeds good for us?",
    }),
  ).toEqual([]);
});

describe("conversation hints (ADR-055)", () => {
  it("asks children's ages first when they are not given", () => {
    expect(conversationHints("I have two children going to school tomorrow.", {})[0]).toMatch(
      /how old they are/,
    );
    expect(conversationHints("My children are 6 and 9 years old.", {})).toEqual([]);
    expect(conversationHints("Plan for my 3-year-old son.", {})).toEqual([]);
    expect(
      conversationHints("Plan for the children.", { members: [{ label: "son", ageYears: 6 }] }),
    ).toEqual([]);
  });

  it("puts leftovers first", () => {
    expect(conversationHints("Now I only have leftover beans, bread and eggs.", {})).toEqual([
      "The user has leftover beans. Build the meal around the leftovers first so nothing is wasted, and say so.",
    ]);
  });
});

it("turns the question to an eating problem the parent describes", () => {
  expect(conversationHints("My baby is 6 months and doesn't like to eat.", {})[0]).toMatch(
    /eating problem/,
  );
  expect(conversationHints("He won't eat vegetables.", {})[0]).toMatch(/eating problem/);
  expect(conversationHints("What can I eat today?", {})).toEqual([]);
});

describe("school meal planner (ADR-058)", () => {
  it("recognises school planning and keeps the checklist for later turns", () => {
    expect(isSchoolMessage("Plan my children's school lunchboxes.")).toBe(true);
    expect(isSchoolMessage("What can they take for break time?")).toBe(true);
    expect(isSchoolMessage("Plan dinner for tonight.")).toBe(false);
    expect(conversationHints("They are 6 and 9.", { school: true })).toContain(SCHOOL_HINT);
    expect(conversationHints("They are 6 and 9.", {})).not.toContain(SCHOOL_HINT);
  });

  it("asks ages before the school checklist", () => {
    const hints = conversationHints("Plan my children's school lunchboxes.", {});
    expect(hints[0]).toMatch(/how old they are/);
    expect(hints[1]).toBe(SCHOOL_HINT);
  });
});

describe("start modes (ADR-058)", () => {
  it("asks what is in the kitchen when the user has not said", () => {
    expect(
      conversationHints("What can I make with the food I already have at home?", {}).join(" "),
    ).toMatch(/what food they have in the kitchen right now/);
    expect(
      conversationHints("What can I make with the food I have: rice, eggs and tomatoes?", {}).join(
        " ",
      ),
    ).not.toMatch(/kitchen right now/);
  });

  it("asks how much they can spend when no amount is given", () => {
    expect(conversationHints("Help me plan what to cook within my budget.", {}).join(" ")).toMatch(
      /how much they can spend/,
    );
    expect(conversationHints("My budget is ₦3,000.", {}).join(" ")).not.toMatch(/how much/);
  });
});
