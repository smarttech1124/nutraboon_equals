import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/conversation/types";
import type { MealPlan } from "@/lib/meals/plan";
import { productMoment } from "@/lib/vendors/product-moment";
import { recommend, type Candidate } from "@/lib/vendors/recommend";

/** When sponsored products may appear in chat (ADR-078). */

const info = { intent: "food_information" as const };
const history = (replies: number): ChatMessage[] =>
  Array.from({ length: replies }, (_, i) => [
    { role: "user" as const, content: `question ${i}` },
    { role: "assistant" as const, content: `answer ${i}` },
  ]).flat();

describe("productMoment", () => {
  it("stays quiet on ordinary food questions and clarifications", () => {
    expect(productMoment("What's the nutrition in an orange?", info, [])).toBeNull();
    expect(productMoment("Is rice good for my 3-year-old?", info, history(2))).toBeNull();
    expect(
      productMoment(
        "Four people, two adults and two children",
        { intent: "meal_planning" },
        history(1),
      ),
    ).toBeNull();
    expect(productMoment("I eat beans in order to get protein", info, history(3))).toBeNull();
  });

  it("offers products when asked for products, brands or what to buy", () => {
    expect(productMoment("Can you suggest a good product for weaning?", info, [])).toBe("asked");
    expect(productMoment("Which brand of oats is best?", info, [])).toBe("asked");
    expect(productMoment("What should I buy for my baby's pap?", info, [])).toBe("asked");
  });

  it("offers products when the conversation turns to buying", () => {
    expect(productMoment("Where can I buy ofada rice in Abeokuta?", info, [])).toBe("purchase");
    expect(productMoment("I want to order soy milk", info, [])).toBe("purchase");
    expect(productMoment("Who sells fresh ugu near me", info, [])).toBe("purchase");
    expect(
      productMoment(
        "I have ₦2,000, what can I cook?",
        {
          intent: "budget_planning",
          shoppingList: [{ item: "tomatoes", quantity: 1 }],
        },
        history(2),
      ),
    ).toBe("purchase");
    expect(productMoment("Make a shopping list", { intent: "shopping_list" }, history(1))).toBe(
      "purchase",
    );
  });

  it("offers products when the person wraps up, or a plan is finished", () => {
    expect(productMoment("Thanks, that's all!", info, history(2))).toBe("closing");
    expect(productMoment("Okay, great", info, history(3))).toBe("closing");
    const plan = { days: [{ day: "Monday", meals: [] }] } as unknown as MealPlan;
    expect(
      productMoment("Yes please", { intent: "meal_planning", mealPlan: plan }, history(3)),
    ).toBe("closing");
  });

  it("does not treat a thank-you with a new question, or an early thanks, as the end", () => {
    expect(productMoment("Thanks! What about dinner?", info, history(3))).toBeNull();
    expect(productMoment("ok, how do I cook it", info, history(3))).toBeNull();
    expect(productMoment("Thanks", info, history(1))).toBeNull();
  });
});

describe("recommend with recent conversation text", () => {
  const candidate: Candidate = {
    id: "p1",
    name: "Ofada Rice",
    ingredients: ["ofada rice"],
    allergens: [],
    matchTerms: ["ofada rice", "rice"],
    availability: "in_stock",
    states: [],
    online: true,
  };

  it("matches a food named earlier and labels it with the product's own term", () => {
    const out = recommend([candidate], {
      terms: [],
      allergies: [],
      recentText: "You could cook ofada rice with stew.\nThanks, that's all",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.term).toBe("ofada rice");
  });

  it("finds nothing when neither the reply nor the conversation names the food", () => {
    expect(recommend([candidate], { terms: [], allergies: [], recentText: "thanks" })).toEqual([]);
  });
});
