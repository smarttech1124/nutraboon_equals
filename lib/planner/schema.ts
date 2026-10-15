import { z } from "zod";
import { MEAL_SLOTS } from "./facts";

/**
 * The Meal Planner's plan format (ADR-066): richer than the chat card, with
 * ingredients, portion guidance, preparation and substitutions. AI output is
 * validated against it; nutrition and prices are added by the app.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

export const ingredientSchema = z.object({
  name: text(60),
  /** As a cook would say it, e.g. "2 cups" or "1 medium". */
  amount: text(40),
  /** Total grams for the household, when the AI can estimate it; used to cost and calculate. */
  grams: z.number().positive().max(20_000).optional().catch(undefined),
  /** A count for items sold by the piece (eggs, plantains). */
  pieces: z.number().positive().max(500).optional().catch(undefined),
});

export const plannerMealSchema = z.object({
  mealType: z.enum(MEAL_SLOTS),
  name: text(100),
  /** General portion guidance per person group; never a clinical prescription. */
  portion: text(200),
  ingredients: z.array(ingredientSchema).min(1).max(15),
  steps: z.array(text(240)).min(1).max(8),
  substitutions: z
    .array(z.object({ ingredient: text(60), alternative: text(60) }))
    .max(4)
    .catch([]),
  /** Why this meal fits the goal, in one plain sentence without figures. */
  why: text(240),
});

export const plannerDaySchema = z.object({
  meals: z.array(plannerMealSchema).min(1).max(6),
  /** How the day supports the goal, briefly. */
  goalNote: text(240),
});

export const plannerChunkSchema = z.object({
  days: z.array(plannerDaySchema).min(1).max(4),
});

export type PlannerIngredient = z.infer<typeof ingredientSchema>;
export type PlannerMeal = z.infer<typeof plannerMealSchema>;
export type PlannerDay = z.infer<typeof plannerDaySchema>;

export const PLANNER_CHUNK_JSON_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                mealType: { type: "string", enum: [...MEAL_SLOTS] },
                name: { type: "string", description: "Dish name, e.g. 'Yam and egg sauce'" },
                portion: {
                  type: "string",
                  description:
                    "General portion guidance for each person group in plain words (e.g. 'Adults: 2 slices of yam; child of 7: 1 slice'). No grams, calories or nutrient figures.",
                },
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      amount: {
                        type: "string",
                        description: "For the whole household, e.g. '2 cups'",
                      },
                      grams: {
                        type: "number",
                        description:
                          "Estimated grams of this ingredient as used in this meal for the household (not the amount bought)",
                      },
                      pieces: {
                        type: "number",
                        description: "Count, for food counted by the piece (eggs, plantains, fish)",
                      },
                    },
                    required: ["name", "amount"],
                  },
                },
                steps: {
                  type: "array",
                  items: { type: "string" },
                  description: "Short preparation steps",
                },
                substitutions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ingredient: { type: "string" },
                      alternative: { type: "string" },
                    },
                    required: ["ingredient", "alternative"],
                  },
                },
                why: {
                  type: "string",
                  description: "One sentence on how this meal fits the goal; no figures",
                },
              },
              required: [
                "mealType",
                "name",
                "portion",
                "ingredients",
                "steps",
                "substitutions",
                "why",
              ],
            },
          },
          goalNote: { type: "string" },
        },
        required: ["meals", "goalNote"],
      },
    },
  },
  required: ["days"],
} as const;

/** Stored weeks are re-validated on read; anything invalid is dropped. */
export function parseDays(value: unknown): PlannerDay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) => {
    const parsed = plannerDaySchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}
