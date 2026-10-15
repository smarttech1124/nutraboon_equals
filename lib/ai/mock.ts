import type { AIProvider, AIRequest, AIResponse } from "./types";

/**
 * Deterministic provider for tests and for running the app without an API key.
 * It does not try to be smart; it only proves the pipeline end to end.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const last = request.messages.at(-1)?.content.toLowerCase() ?? "";

    // Demo samples first, so their trigger words don't fall into the generic rules below.
    if (/sample budget/.test(last)) {
      return {
        intent: "budget_planning",
        message:
          "Demo mode. You can make garri and beans with stew, using what you have and a few extras.",
        recommendedFoods: ["garri", "beans", "tomatoes", "onions", "palm oil"],
        fromHome: ["beans", "palm oil"],
        shoppingList: [
          { item: "garri", quantity: 0.5 },
          { item: "tomatoes", quantity: 0.25 },
          { item: "onions", quantity: 0.25 },
        ],
      };
    }
    if (/sample plan/.test(last)) {
      return {
        intent: "meal_planning",
        message: "Demo mode. Here is a sample one-day plan.",
        recommendedFoods: ["oats", "banana", "rice", "beans", "palm oil", "orange", "yam", "egg"],
        mealPlan: {
          days: [
            {
              day: "Day 1",
              meals: [
                { mealType: "breakfast", name: "Oats with banana", foods: ["oats", "banana"] },
                {
                  mealType: "lunch",
                  name: "Rice and beans",
                  foods: ["rice", "beans", "palm oil", "onion"],
                },
                { mealType: "snack", name: "Orange", foods: ["orange"] },
                {
                  mealType: "dinner",
                  name: "Boiled yam and egg sauce",
                  foods: ["yam", "egg", "tomato", "palm oil"],
                  portionNote: "Smaller portions for young children.",
                },
              ],
            },
          ],
        },
      };
    }
    if (/₦|naira|budget|\bn\d/.test(last)) {
      return {
        intent: "budget_planning",
        message: "Let's make the most of your budget. What food do you already have at home?",
        followUpQuestion: "What food do you already have at home?",
      };
    }
    if (/meal plan|plan meals|plan my meals/.test(last)) {
      return {
        intent: "meal_planning",
        message: "Happy to help. Who are we planning the meals for?",
        followUpQuestion: "Who are we planning the meals for?",
      };
    }
    if (/pregnan|baby|infant|toddler|\b[1-4][- ]?year[- ]?old/.test(last)) {
      return {
        intent: "safety_sensitive",
        message:
          "I can share general food ideas. Does anyone involved have allergies or foods they need to avoid?",
        followUpQuestion: "Does anyone involved have allergies or foods they need to avoid?",
        safetyNotice:
          "Needs vary from person to person, so check with a qualified health professional for personal advice.",
      };
    }

    // Echo verified food data so the nutrition pipeline can be checked by hand.
    const facts = verifiedDataLines(request.systemPrompt);
    if (facts.length > 0) {
      return {
        intent: "food_information",
        message: `Demo mode. Verified data I was given:\n${facts.map((f) => `- ${f}`).join("\n")}`,
      };
    }

    return {
      intent: "general_nutrition",
      message:
        "I'm running in demo mode, so I can't give a full answer yet. Ask me about a food, a meal plan, or your food budget.",
    };
  }
}

function verifiedDataLines(systemPrompt: string): string[] {
  const section = systemPrompt.split("VERIFIED DATA:\n")[1];
  if (!section) return [];
  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}
