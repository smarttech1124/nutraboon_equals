import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export const mealSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  name: z.string().trim().min(1).max(100),
  foods: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  portionNote: z.string().trim().min(1).max(160).optional(),
  /** Food the child takes to school (lunchbox or snack) (ADR-058). */
  packed: z.boolean().optional().catch(undefined),
  /** One short reason for the meal (energy, protein, fruit…), shown under it (ADR-055). */
  why: z.string().trim().min(1).max(240).optional().catch(undefined),
});

export const mealPlanSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.string().trim().min(1).max(30),
        meals: z.array(mealSchema).min(1).max(6),
      }),
    )
    .min(1)
    .max(7),
  notes: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
});

export type Meal = z.infer<typeof mealSchema>;
export type MealPlan = z.infer<typeof mealPlanSchema>;

export const mealPlanJsonSchema = {
  type: "object",
  description:
    "Only when you are giving the user a meal plan. The app displays it, so keep message to a short introduction.",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string", description: 'e.g. "Monday" or "Day 1"' },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                mealType: { type: "string", enum: [...MEAL_TYPES] },
                name: { type: "string", description: 'Dish name, e.g. "Yam and egg sauce"' },
                foods: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Every food and ingredient in the dish, including oil and fish/crayfish.",
                },
                portionNote: { type: "string", description: "Optional general portion guidance." },
                packed: {
                  type: "boolean",
                  description:
                    "True for food the child takes to school (lunchbox or school snack).",
                },
                why: {
                  type: "string",
                  description:
                    "One plain sentence on why this meal: what each main food adds (e.g. 'Rice gives energy, the egg adds protein and the orange adds vitamin C.'). No figures.",
                },
              },
              required: ["mealType", "name", "foods"],
            },
          },
        },
        required: ["day", "meals"],
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["days"],
} as const;

/** The "why" lines of a plan, checked like the reply text. */
export function planReasons(plan: MealPlan | undefined): string[] {
  if (!plan) return [];
  return plan.days.flatMap((d) => d.meals.flatMap((m) => (m.why ? [m.why] : [])));
}

/** Every dish name and food in a plan, for safety checks. */
export function planFoods(plan: MealPlan | undefined): string[] {
  if (!plan) return [];
  return plan.days.flatMap((d) => d.meals.flatMap((m) => [m.name, ...m.foods]));
}
