import { describe, expect, it } from "vitest";
import {
  knownFactLines,
  mealPlanGuidanceLines,
  mergeProfile,
  missingForMealPlan,
  safetyContextOf,
} from "@/lib/conversation/profile";

describe("mergeProfile", () => {
  it("overwrites facts, replaces members and unions lists", () => {
    const merged = mergeProfile(
      { householdSize: 3, availableIngredients: ["rice", "Beans"], avoidFoods: ["pork"] },
      {
        householdSize: 4,
        members: [{ label: "adult" }, { label: "son", ageYears: 3 }],
        availableIngredients: ["beans", "eggs"],
        allergies: ["peanut"],
      },
    );
    expect(merged).toEqual({
      householdSize: 4,
      members: [{ label: "adult" }, { label: "son", ageYears: 3 }],
      availableIngredients: ["rice", "Beans", "eggs"],
      avoidFoods: ["pork"],
    });
  });

  it("keeps the profile when there is no update", () => {
    const profile = { householdSize: 2 };
    expect(mergeProfile(profile, undefined)).toBe(profile);
  });
});

describe("safetyContextOf", () => {
  it("derives infant, under-5 and pregnancy flags from facts", () => {
    expect(safetyContextOf({ members: [{ label: "baby", ageYears: 0.5 }] })).toMatchObject({
      infant: true,
      childUnder5: true,
      pregnant: false,
      onlyBabiesUnder6Months: false,
    });
    expect(
      safetyContextOf({ members: [{ label: "son", ageYears: 7 }], pregnant: true }),
    ).toMatchObject({
      infant: false,
      childUnder5: false,
      pregnant: true,
    });
  });

  it("flags when everyone is a baby under 6 months, but not a mixed household", () => {
    expect(
      safetyContextOf({ members: [{ label: "baby", ageYears: 0.3 }] }).onlyBabiesUnder6Months,
    ).toBe(true);
    expect(
      safetyContextOf({
        members: [
          { label: "baby", ageYears: 0.3 },
          { label: "me", ageYears: 30 },
        ],
      }).onlyBabiesUnder6Months,
    ).toBe(false);
  });

  it("carries conditions, breastfeeding and medication", () => {
    expect(
      safetyContextOf({ conditions: ["diabetes"], breastfeeding: true, takesMedication: true }),
    ).toMatchObject({ conditions: ["diabetes"], breastfeeding: true, takesMedication: true });
  });
});

describe("knownFactLines", () => {
  it("summarises everything known so it is never asked again", () => {
    const [line] = knownFactLines(
      {
        householdSize: 4,
        members: [
          { label: "adult" },
          { label: "adult" },
          { label: "child", ageYears: 3 },
          { label: "baby", ageYears: 0.5 },
        ],
        availableIngredients: ["rice", "beans"],
        budgetNaira: 2000,
      },
      ["peanut"],
    );
    expect(line).toContain("never ask for these again");
    expect(line).toContain(
      "Planning for 4 people: adult, adult, child (3 years), baby (6 months).",
    );
    expect(line).toContain("Allergies: peanut.");
    expect(line).toContain("Food already at home: rice, beans.");
    expect(line).toContain("Budget: ₦2,000.");
  });

  it("records a confirmed 'no allergies'", () => {
    expect(knownFactLines({ allergiesConfirmed: true }, [])[0]).toContain("No food allergies");
  });

  it("is empty when nothing is known", () => {
    expect(knownFactLines({}, [])).toEqual([]);
  });
});

describe("missingForMealPlan", () => {
  it("asks in the CLAUDE.md order: who, ages, allergies, food at home", () => {
    expect(missingForMealPlan({}, [])).toEqual([
      "who the meals are for and how old they are",
      "whether anyone has food allergies or foods to avoid",
      "what food they already have at home",
    ]);
    expect(missingForMealPlan({ householdSize: 4 }, [])[0]).toMatch(/how old each person is/);
  });

  it("treats adults and stated ages as known", () => {
    const profile = {
      householdSize: 2,
      members: [{ label: "adult" }, { label: "son", ageYears: 3 }],
    };
    expect(missingForMealPlan(profile, ["peanut"])).toEqual([
      "what food they already have at home",
    ]);
  });

  it("needs nothing more once everything is known", () => {
    const profile = {
      householdSize: 1,
      members: [{ label: "me", ageYears: 30 }],
      allergiesConfirmed: true,
      availableIngredients: ["rice"],
    };
    expect(missingForMealPlan(profile, [])).toEqual([]);
    expect(mealPlanGuidanceLines(profile, [])[0]).toMatch(/produce it now/);
  });

  it("does not ask who the plan is for when the user is pregnant", () => {
    expect(missingForMealPlan({ pregnant: true }, [])).not.toContain(
      "who the meals are for and how old they are",
    );
  });
});
