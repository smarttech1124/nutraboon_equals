import type { AIProvider } from "@/lib/ai/types";
import { safetyContextLines } from "@/lib/conversation/profile";
import { allergyContextLines } from "@/lib/safety/allergy";
import { conditionLabel } from "@/lib/safety/context";
import { checkMedicalRules } from "@/lib/safety/medical-rules";
import { checkReply, correctionFor, type SafetyViolation } from "@/lib/safety/reply-check";
import { describeFacts, safetyOf, type MealSlot, type PlannerFacts } from "./facts";
import { PLANNER_CHUNK_JSON_SCHEMA, plannerChunkSchema, type PlannerDay } from "./schema";

/**
 * Plan generation (ADR-066). A week is written in chunks of up to two days,
 * at the same time; each chunk centres on different staples and sees the
 * meals of earlier weeks, so the plan stays varied.
 * Every chunk is validated and passes the same deterministic safety checks
 * as chat (allergies, foods to avoid, child and pregnancy rules, doses);
 * a failing chunk is regenerated once with the correction, then refused.
 */

export const PROMPT_VERSION = "meal-planner-v1";
export const CHUNK_DAYS = 2;
/** Time allowed for one chunk: a day of recipes is a long answer. */
export const CHUNK_TIMEOUT_MS = 60_000;

/**
 * Chunks of a week are written at the same time; each gets different staples
 * to centre on, so days stay varied without waiting for each other.
 */
export const STAPLE_ROTATION = [
  "yam",
  "rice",
  "beans",
  "plantain",
  "garri or fufu",
  "sweet potato",
  "maize (pap, corn)",
  "millet or sorghum (tuwo)",
  "potato",
  "bread or wheat",
];

export function stapleFocus(firstDay: number, count: number): string[] {
  return Array.from(
    { length: count * 2 },
    (_, i) => STAPLE_ROTATION[((firstDay - 1) * 2 + i) % STAPLE_ROTATION.length],
  );
}

export class PlannerGenerationError extends Error {
  constructor(readonly reason: "unavailable" | "invalid" | "unsafe") {
    super(`Plan generation failed: ${reason}`);
    this.name = "PlannerGenerationError";
  }
}

/** Meals every day must have: the user's choice, else the three main meals. */
export function requiredSlots(facts: PlannerFacts): MealSlot[] {
  return facts.mealSlots?.length ? facts.mealSlots : ["breakfast", "lunch", "dinner"];
}

function systemPrompt(facts: PlannerFacts): string {
  const safety = safetyOf(facts);
  const slots = requiredSlots(facts);
  return [
    "You write meal plans for Nutraboom Equals, a Nigerian nutrition service. Plans are practical, affordable and built mostly from foods sold in Nigerian markets, with familiar Nigerian dishes.",
    `THE PLAN IS FOR:\n${describeFacts(facts).join("\n")}`,
    `Every day must include each of these meals: ${slots.join(", ")}${facts.mealSlots?.length ? "" : " (and a snack if it helps)"}.`,
    "Rules:",
    "- Vary meals across days; reuse ingredients sensibly so shopping stays simple.",
    "- Portion guidance is general and in plain words for each person group. Never give calories, grams in portions, or nutrient amounts: the app calculates nutrition itself.",
    "- For each ingredient give the amount used in this meal for the whole household, and the estimated weight in grams of that amount as used (not a whole tuber or bag bought), or a count of pieces for things counted by the piece (eggs, plantains, fish).",
    "- Preparation steps are short and safe (cook eggs, meat and fish through).",
    "- Substitutions must respect every allergy and food to avoid.",
    "- Never mention medicines, supplements or doses. Never promise health outcomes.",
    ...(facts.budgetNaira
      ? ["- Keep the food affordable for the stated budget; prefer cheaper staples."]
      : []),
    ...(facts.cookingMinutes ? [`- Keep cooking to about ${facts.cookingMinutes} minutes.`] : []),
    ...(facts.hasFridge === false ? ["- No fridge: avoid leftovers that need cold storage."] : []),
    ...((safety.conditions ?? []).length > 0
      ? [
          `- Health conditions mentioned (${(safety.conditions ?? []).map(conditionLabel).join(", ")}): general healthy choices only; their doctor or a registered dietitian tailors advice.`,
        ]
      : []),
    ...safetyContextLines(safety),
    ...allergyContextLines(facts.allergies ?? [], []),
    "Reply only with the JSON object described by the schema.",
  ].join("\n");
}

function chunkPrompt(
  firstDay: number,
  count: number,
  previousMeals: string[],
  feedback: string | undefined,
  correction: string | undefined,
): string {
  return [
    `Write days ${firstDay} to ${firstDay + count - 1} of the plan (${count} day${count === 1 ? "" : "s"}).`,
    `For variety, centre these days mostly on: ${stapleFocus(firstDay, count).join(", ")} (where they fit the goal and restrictions).`,
    previousMeals.length
      ? `Meals already in the plan (do not repeat them too often): ${previousMeals.slice(-40).join("; ")}.`
      : "",
    feedback
      ? `<user_feedback>${feedback}</user_feedback>\nAdjust the plan to this feedback where it is safe.`
      : "",
    correction ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Every name the checks look at, and all free text, for one or more days. */
function checkDays(days: PlannerDay[], facts: PlannerFacts): SafetyViolation[] {
  const items = days.flatMap((d) =>
    d.meals.flatMap((m) => [
      m.name,
      ...m.ingredients.map((i) => i.name),
      ...m.substitutions.map((s) => s.alternative),
    ]),
  );
  const text = days
    .flatMap((d) => [d.goalNote, ...d.meals.flatMap((m) => [m.portion, m.why, ...m.steps])])
    .join("\n");
  const safety = safetyOf(facts);
  return [
    ...checkReply(
      { message: text, planItems: items },
      { allergies: facts.allergies ?? [], avoidFoods: facts.avoidFoods, safety },
    ),
    ...checkMedicalRules(
      { message: text, suggested: items },
      { pregnant: safety.pregnant, onlyBabiesUnder6Months: safety.onlyBabiesUnder6Months },
    ),
  ];
}

export { checkDays };

async function generateChunk(
  provider: AIProvider,
  facts: PlannerFacts,
  firstDay: number,
  count: number,
  previousMeals: string[],
  feedback?: string,
): Promise<PlannerDay[]> {
  let correction: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      raw = await provider.generateJson!({
        systemPrompt: systemPrompt(facts),
        prompt: chunkPrompt(firstDay, count, previousMeals, feedback, correction),
        schema: PLANNER_CHUNK_JSON_SCHEMA,
        schemaName: "meal_plan_days",
        timeoutMs: CHUNK_TIMEOUT_MS,
      });
    } catch {
      throw new PlannerGenerationError("unavailable");
    }
    const parsed = plannerChunkSchema.safeParse(raw);
    if (!parsed.success || parsed.data.days.length < count) {
      if (attempt === 0) {
        correction = `Your previous answer was incomplete. Return exactly ${count} day(s), each with meals and a goalNote.`;
        continue;
      }
      throw new PlannerGenerationError("invalid");
    }
    const days = parsed.data.days.slice(0, count);
    const slots = requiredSlots(facts);
    const complete = days.every((d) =>
      slots.every((slot) => d.meals.some((m) => m.mealType === slot)),
    );
    if (!complete) {
      if (attempt === 0) {
        correction = `Every day must include ${slots.join(", ")}. Return the day(s) again with all of these meals.`;
        continue;
      }
      throw new PlannerGenerationError("invalid");
    }
    const violations = checkDays(days, facts);
    if (violations.length === 0) return days;
    if (attempt === 0) {
      correction = correctionFor(violations);
      continue;
    }
    throw new PlannerGenerationError("unsafe");
  }
  throw new PlannerGenerationError("invalid");
}

/**
 * Writes `dayCount` days starting at plan day `firstDay` (1-based), in
 * chunks. `previousMeals` are names from earlier weeks, for variety.
 */
export async function generateDays(
  provider: AIProvider,
  facts: PlannerFacts,
  firstDay: number,
  dayCount: number,
  previousMeals: string[] = [],
  feedback?: string,
): Promise<PlannerDay[]> {
  if (!provider.generateJson) throw new PlannerGenerationError("unavailable");
  const chunks: { firstDay: number; count: number }[] = [];
  for (let offset = 0; offset < dayCount; offset += CHUNK_DAYS) {
    chunks.push({ firstDay: firstDay + offset, count: Math.min(CHUNK_DAYS, dayCount - offset) });
  }
  const results = await Promise.all(
    chunks.map((c) => generateChunk(provider, facts, c.firstDay, c.count, previousMeals, feedback)),
  );
  return results.flat();
}

/** Replaces one meal, keeping its slot; checked like any other plan text. */
export async function replaceMeal(
  provider: AIProvider,
  facts: PlannerFacts,
  day: PlannerDay,
  mealIndex: number,
  reason: string,
): Promise<PlannerDay> {
  if (!provider.generateJson) throw new PlannerGenerationError("unavailable");
  const meal = day.meals[mealIndex];
  const others = day.meals.filter((_, i) => i !== mealIndex).map((m) => m.name);
  const feedback = `Replace only the ${meal.mealType} "${meal.name}" with a different ${meal.mealType}${
    reason ? ` (${reason})` : ""
  }. Keep the other meals of the day: ${others.join("; ")}.`;
  const [newDay] = await generateDays(provider, facts, 1, 1, [meal.name, ...others], feedback);
  const replacement =
    newDay.meals.find((m) => m.mealType === meal.mealType && m.name !== meal.name) ??
    newDay.meals.find((m) => m.mealType === meal.mealType);
  if (!replacement) throw new PlannerGenerationError("invalid");
  const meals = day.meals.map((m, i) => (i === mealIndex ? replacement : m));
  return { ...day, meals };
}
