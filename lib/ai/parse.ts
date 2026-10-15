import { mealPlanSchema } from "@/lib/meals/plan";
import { assistantResponseSchema } from "@/lib/validation/chat";
import { AIProviderError, type AIResponse } from "./types";

/** Parses and validates raw JSON text from a provider. Throws AIProviderError on bad output. */
export function parseAssistantOutput(text: string | undefined): AIResponse {
  if (!text) {
    throw new AIProviderError("Empty response from provider", "invalid_output");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AIProviderError("Provider returned non-JSON output", "invalid_output", {
      cause: error,
    });
  }

  const result = assistantResponseSchema.safeParse(json);
  if (!result.success) {
    throw new AIProviderError("Provider output failed schema validation", "invalid_output", {
      cause: result.error,
    });
  }
  const { mealPlan: rawPlan, ...rest } = result.data;
  if (rawPlan === undefined || rawPlan === null) return rest;
  const plan = mealPlanSchema.safeParse(rawPlan);
  return plan.success ? { ...rest, mealPlan: plan.data } : { ...rest, invalidMealPlan: true };
}
