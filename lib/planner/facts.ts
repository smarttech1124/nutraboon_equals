import { z } from "zod";
import { detectBudget } from "@/lib/budget/money";
import { canonicalState, detectState } from "@/lib/budget/regions";
import {
  memberSchema,
  safetyContextOf,
  type SafetyContext,
  type UserProfile,
} from "@/lib/conversation/profile";
import {
  detectDeclaredAllergies,
  detectNoAllergies,
  findAllergenTerms,
} from "@/lib/safety/allergy";
import {
  detectBreastfeeding,
  detectConditions,
  detectMedication,
  detectPregnancy,
} from "@/lib/safety/context";

/**
 * What the Meal Planner knows about the people it plans for (ADR-066). The
 * app decides which facts are still needed; the AI only phrases questions
 * and reads answers. Health facts are mapped through the same vocabularies
 * as chat (allergens, conditions), never taken as free text.
 */

export const OBJECTIVES = {
  child_nutrition: "Better nutrition for a child",
  focus: "Food that supports attention and focus",
  strength: "Strength and agility",
  healthy: "General healthy eating",
  weight: "Weight management",
  family: "Family meal planning",
  budget: "Eating well on a budget",
  preferences: "Meals around food preferences",
  restrictions: "Meals around dietary restrictions",
  lifestyle: "Nutrition for a lifestyle (work, sport, schedule)",
  custom: "A goal in your own words",
} as const;

export type Objective = keyof typeof OBJECTIVES;
export const OBJECTIVE_KEYS = Object.keys(OBJECTIVES) as Objective[];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const plannerFactsSchema = z.object({
  objective: z.enum(OBJECTIVE_KEYS as [Objective, ...Objective[]]).optional(),
  /** The goal in the user's words, e.g. "help my son focus at school". */
  objectiveDetail: z.string().trim().max(200).optional(),
  members: z.array(memberSchema).max(20).optional(),
  pregnant: z.boolean().optional(),
  trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  breastfeeding: z.boolean().optional(),
  /** Allergen keys (lib/safety/allergens.ts). */
  allergies: z.array(z.string()).max(20).optional(),
  allergiesConfirmed: z.boolean().optional(),
  avoidFoods: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** Condition keys (lib/safety/context.ts). */
  conditions: z.array(z.string()).max(10).optional(),
  takesMedication: z.boolean().optional(),
  /** e.g. "vegetarian", "no pork". */
  dietPattern: z.string().trim().max(80).optional(),
  budgetNaira: z.number().positive().max(100_000_000).optional(),
  budgetPeriod: z.enum(["day", "week", "month"]).optional(),
  state: z.string().optional(),
  cookingMinutes: z.number().int().min(5).max(600).optional(),
  hasFridge: z.boolean().optional(),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).min(1).max(4).optional(),
  weightGoal: z.enum(["lose", "gain", "maintain"]).optional(),
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  /** The one open "anything else?" question has been asked. */
  extrasAsked: z.boolean().optional(),
});

export type PlannerFacts = z.infer<typeof plannerFactsSchema>;

/** Stored JSON is not trusted: invalid facts are dropped one field at a time. */
export function parseFacts(value: unknown): PlannerFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(plannerFactsSchema.shape)) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const parsed = (field as z.ZodType).safeParse(raw);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as PlannerFacts;
}

/** The AI's reading of the user's answer: words, mapped by the app. */
export const factsUpdateSchema = z.object({
  objective: z
    .enum(OBJECTIVE_KEYS as [Objective, ...Objective[]])
    .optional()
    .catch(undefined),
  objectiveDetail: z.string().trim().max(200).optional().catch(undefined),
  members: z.array(memberSchema).max(20).optional().catch(undefined),
  allergies: z.array(z.string().trim().max(60)).max(20).optional().catch(undefined),
  noAllergies: z.boolean().optional().catch(undefined),
  avoidFoods: z.array(z.string().trim().min(1).max(60)).max(20).optional().catch(undefined),
  conditions: z.array(z.string().trim().max(60)).max(10).optional().catch(undefined),
  dietPattern: z.string().trim().max(80).optional().catch(undefined),
  budgetNaira: z.number().positive().max(100_000_000).optional().catch(undefined),
  budgetPeriod: z.enum(["day", "week", "month"]).optional().catch(undefined),
  cookingMinutes: z.number().int().min(5).max(600).optional().catch(undefined),
  hasFridge: z.boolean().optional().catch(undefined),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).min(1).max(4).optional().catch(undefined),
  weightGoal: z.enum(["lose", "gain", "maintain"]).optional().catch(undefined),
  activityLevel: z.enum(["low", "moderate", "high"]).optional().catch(undefined),
});

export type FactsUpdate = z.infer<typeof factsUpdateSchema>;

const unique = <T>(list: T[]) => [...new Set(list)];

/**
 * Merges what the AI read with what the app detects in the user's own words.
 * Detection wins for health facts; the AI cannot remove a declared allergy.
 */
export function mergeFacts(
  facts: PlannerFacts,
  update: FactsUpdate,
  userMessage: string,
  options: { customObjectives: boolean },
): PlannerFacts {
  const next: PlannerFacts = { ...facts };
  if (update.objective && (update.objective !== "custom" || options.customObjectives)) {
    next.objective = update.objective;
  }
  if (update.objectiveDetail) next.objectiveDetail = update.objectiveDetail;
  if (update.members?.length) next.members = update.members;
  for (const key of [
    "dietPattern",
    "budgetNaira",
    "budgetPeriod",
    "cookingMinutes",
    "hasFridge",
    "mealSlots",
    "weightGoal",
    "activityLevel",
  ] as const) {
    if (update[key] !== undefined) (next as Record<string, unknown>)[key] = update[key];
  }
  if (update.avoidFoods?.length)
    next.avoidFoods = unique([...(facts.avoidFoods ?? []), ...update.avoidFoods]);

  const declared = [
    ...detectDeclaredAllergies(userMessage),
    ...(update.allergies ?? []).flatMap((a) => findAllergenTerms(a).flatMap((m) => m.allergens)),
  ];
  if (declared.length > 0) {
    next.allergies = unique([...(facts.allergies ?? []), ...declared]);
    next.allergiesConfirmed = true;
  } else if (update.noAllergies || detectNoAllergies(userMessage)) {
    next.allergiesConfirmed = true;
  }

  const conditions = detectConditions([userMessage, ...(update.conditions ?? [])].join(". "));
  if (conditions.length > 0) next.conditions = unique([...(facts.conditions ?? []), ...conditions]);
  const pregnancy = detectPregnancy(userMessage);
  if (pregnancy) {
    next.pregnant = true;
    if (pregnancy.trimester) next.trimester = pregnancy.trimester;
  }
  if (detectBreastfeeding(userMessage)) next.breastfeeding = true;
  if (detectMedication(userMessage)) next.takesMedication = true;

  const budget = detectBudget(userMessage);
  if (budget !== undefined && next.budgetNaira === undefined) next.budgetNaira = budget;
  const state = detectState(userMessage);
  if (state) next.state = canonicalState(state);
  return parseFacts(next);
}

export function safetyOf(facts: PlannerFacts): SafetyContext {
  return safetyContextOf(facts as UserProfile);
}

export type Topic = "objective" | "members" | "allergies" | "budget" | "weightGoal" | "extras";

/** What must still be asked, most important first. Only what the plan needs. */
export function missingTopics(facts: PlannerFacts): Topic[] {
  const missing: Topic[] = [];
  if (!facts.objective) missing.push("objective");
  const members = facts.members ?? [];
  if (members.length === 0 || members.some((m) => m.ageYears === undefined))
    missing.push("members");
  if (!facts.allergiesConfirmed) missing.push("allergies");
  if (facts.objective === "budget" && facts.budgetNaira === undefined) missing.push("budget");
  if (facts.objective === "weight" && !facts.weightGoal) missing.push("weightGoal");
  if (missing.length === 0 && !facts.extrasAsked) missing.push("extras");
  return missing;
}

export const TOPIC_PROMPTS: Record<Topic, string> = {
  objective:
    "Ask what they want the meal plan to help with (their goal). Offer two or three examples in plain words.",
  members:
    "Ask who the plan is for and their ages (for example: just me, 34; or two adults and children of 3 and 7). If they already said who but not every age, ask only for the missing ages.",
  allergies: "Ask whether anyone in the plan has a food allergy or foods they must avoid.",
  budget:
    "Ask roughly how much they can spend on food, and whether that is per day, week or month.",
  weightGoal:
    "Ask whether the goal is to lose, gain or keep a steady weight, and how active they are.",
  extras:
    "Ask one last open question: anything else to plan around, such as foods they dislike, cooking time, no fridge, or which meals they want (breakfast, lunch, dinner, snacks). Say they can also just say they are ready.",
};

/**
 * Situations the planner must not plan for, decided by code (ADR-066).
 * Returns plain messages for the user; empty when planning can go ahead.
 */
export function planBlockers(facts: PlannerFacts): string[] {
  const blockers: string[] = [];
  const ages = (facts.members ?? []).flatMap((m) => (m.ageYears === undefined ? [] : [m.ageYears]));
  if (ages.length > 0 && ages.length === facts.members!.length && ages.every((a) => a < 0.5)) {
    blockers.push(
      "Babies under 6 months need only breast milk or infant formula, so there is no meal plan to make. A child welfare clinic or health worker can advise on feeding.",
    );
  }
  if (facts.weightGoal === "lose" && (facts.pregnant || ages.some((a) => a < 18))) {
    blockers.push(
      "We do not plan weight loss for children or during pregnancy. We can plan healthy, balanced meals instead; a doctor or registered dietitian can advise on weight.",
    );
  }
  if ((facts.conditions ?? []).includes("eating_disorder")) {
    blockers.push(
      "Because an eating disorder was mentioned, a meal plan should come from your doctor or a registered dietitian who knows you. Please reach out to them.",
    );
  }
  return blockers;
}

/** Plain-language lines describing the people and constraints, for prompts and summaries. */
export function describeFacts(facts: PlannerFacts): string[] {
  const lines: string[] = [];
  if (facts.objective) {
    lines.push(
      `Goal: ${OBJECTIVES[facts.objective]}${facts.objectiveDetail ? ` (${facts.objectiveDetail})` : ""}`,
    );
  }
  if (facts.members?.length) {
    lines.push(
      `For: ${facts.members
        .map((m) =>
          m.ageYears === undefined
            ? m.label
            : `${m.label} (${m.ageYears < 1 ? `${Math.round(m.ageYears * 12)} months` : `${m.ageYears} years`})`,
        )
        .join(", ")}`,
    );
  }
  if (facts.pregnant)
    lines.push(`Pregnant${facts.trimester ? ` (trimester ${facts.trimester})` : ""}`);
  if (facts.breastfeeding) lines.push("Breastfeeding");
  if (facts.allergies?.length) lines.push(`Allergies: ${facts.allergies.join(", ")}`);
  else if (facts.allergiesConfirmed) lines.push("No food allergies");
  if (facts.avoidFoods?.length) lines.push(`Avoid: ${facts.avoidFoods.join(", ")}`);
  if (facts.dietPattern) lines.push(`Diet: ${facts.dietPattern}`);
  if (facts.conditions?.length) lines.push(`Health conditions: ${facts.conditions.join(", ")}`);
  if (facts.budgetNaira) {
    lines.push(
      `Budget: ₦${facts.budgetNaira.toLocaleString("en-NG")}${facts.budgetPeriod ? ` per ${facts.budgetPeriod}` : ""}`,
    );
  }
  if (facts.weightGoal) lines.push(`Weight goal: ${facts.weightGoal}`);
  if (facts.activityLevel) lines.push(`Activity: ${facts.activityLevel}`);
  if (facts.cookingMinutes) lines.push(`Cooking time: about ${facts.cookingMinutes} minutes`);
  if (facts.hasFridge === false) lines.push("No fridge");
  if (facts.mealSlots?.length) lines.push(`Meals: ${facts.mealSlots.join(", ")}`);
  if (facts.state) lines.push(`Lives in: ${facts.state}`);
  return lines;
}

/** Plan lengths offered, in days; the entitlement cuts the list. */
export const DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: "1 day" },
  { days: 2, label: "2 days" },
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 183, label: "6 months" },
  { days: 366, label: "1 year" },
];

export function allowedDurations(maxDays: number) {
  return DURATIONS.filter((d) => d.days <= maxDays);
}
