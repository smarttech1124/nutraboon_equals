import { describe, expect, it } from "vitest";
import { parseAssistantOutput } from "@/lib/ai/parse";
import { planFoods, type MealPlan } from "@/lib/meals/plan";
import { detectNoAllergies } from "@/lib/safety/allergy";
import { checkReply } from "@/lib/safety/reply-check";

const plan = (foods: string[], name = "Dish"): MealPlan => ({
  days: [{ day: "Day 1", meals: [{ mealType: "lunch", name, foods }] }],
});

const noKids = { infant: false, childUnder5: false, pregnant: false };

describe("checkReply", () => {
  it("rejects plan foods containing a declared allergen, including dish names", () => {
    const items = planFoods(plan(["rice", "stew"], "Rice with groundnut soup"));
    const violations = checkReply(
      { message: "Here you go.", planItems: items },
      { allergies: ["peanut"] },
    );
    expect(violations).toEqual([expect.objectContaining({ kind: "allergy", term: "groundnut" })]);
  });

  it("rejects foods the user avoids for other reasons", () => {
    const violations = checkReply(
      { message: "Plan below.", planItems: planFoods(plan(["pork sausages", "bread"])) },
      { allergies: [], avoidFoods: ["pork"] },
    );
    expect(violations).toEqual([
      { kind: "avoid", term: "pork sausages", reason: "the user avoids pork" },
    ]);
  });

  it("rejects honey when a baby under 12 months is involved", () => {
    const violations = checkReply(
      { message: "Plan below.", planItems: planFoods(plan(["pap", "honey"])) },
      { allergies: [], safety: { infant: true, childUnder5: true, pregnant: false } },
    );
    expect(violations).toEqual([expect.objectContaining({ kind: "child_safety", term: "honey" })]);
  });

  it("rejects whole groundnuts for a child under 5, but allows them otherwise", () => {
    const reply = { message: "Snack.", recommendedFoods: ["roasted groundnuts", "banana"] };
    expect(checkReply(reply, { allergies: [], safety: { ...noKids, childUnder5: true } })).toEqual([
      expect.objectContaining({ kind: "child_safety", term: "roasted groundnuts" }),
    ]);
    expect(checkReply(reply, { allergies: [], safety: noKids })).toEqual([]);
  });

  it("allows honey in a message that warns against it", () => {
    expect(
      checkReply(
        { message: "Do not give honey before 12 months.", planItems: planFoods(plan(["pap"])) },
        { allergies: [], safety: { infant: true, childUnder5: true, pregnant: false } },
      ),
    ).toEqual([]);
  });
});

describe("parseAssistantOutput with a meal plan", () => {
  it("accepts a valid plan", () => {
    const reply = parseAssistantOutput(
      JSON.stringify({
        message: "Here is your plan.",
        intent: "meal_planning",
        mealPlan: plan(["rice"]),
      }),
    );
    expect(reply.mealPlan?.days[0].meals[0].foods).toEqual(["rice"]);
    expect(reply.invalidMealPlan).toBeUndefined();
  });

  it("flags a malformed plan instead of failing the reply", () => {
    const reply = parseAssistantOutput(
      JSON.stringify({
        message: "Here is your plan.",
        intent: "meal_planning",
        mealPlan: {
          days: [{ day: "Day 1", meals: [{ mealType: "brunch", name: "x", foods: [] }] }],
        },
      }),
    );
    expect(reply.mealPlan).toBeUndefined();
    expect(reply.invalidMealPlan).toBe(true);
  });

  it("drops a malformed profile update but keeps the reply", () => {
    const reply = parseAssistantOutput(
      JSON.stringify({ message: "Hi", intent: "unknown", profileUpdate: { householdSize: -2 } }),
    );
    expect(reply.message).toBe("Hi");
    expect(reply.profileUpdate).toBeUndefined();
  });
});

describe("detectNoAllergies", () => {
  it.each(["No allergies.", "None of us is allergic to anything", "We don't have any allergies"])(
    "%j confirms no allergies",
    (message) => expect(detectNoAllergies(message)).toBe(true),
  );

  it.each(["She's allergic to eggs", "Not allergic to anything except sesame", "Plan dinner"])(
    "%j does not",
    (message) => expect(detectNoAllergies(message)).toBe(false),
  );
});
