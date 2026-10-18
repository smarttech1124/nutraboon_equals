import { z } from "zod";
import { detectBudget } from "@/lib/budget/money";
import { canonicalState, REGION_LABEL, zoneOfState } from "@/lib/budget/regions";
import { normalizeText } from "@/lib/nutrition/match";
import { conditionLabel, detectConditions } from "@/lib/safety/context";
import { allergenLabel } from "@/lib/safety/allergy";

/**
 * Facts the user has told us during the conversation (CLAUDE.md §20). The
 * model reports new facts as a structured profileUpdate each turn; the app
 * merges and stores them, feeds them back as "known, do not ask again", and
 * works out what is still missing (ADR-004, ADR-015).
 */
export const memberSchema = z.object({
  label: z.string().trim().min(1).max(40),
  /** Decimal for babies: 6 months = 0.5. */
  ageYears: z.number().min(0).max(120).optional(),
});

export const profileUpdateSchema = z.object({
  householdSize: z.number().int().min(1).max(30).optional(),
  members: z.array(memberSchema).max(30).optional(),
  pregnant: z.boolean().optional(),
  trimester: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** True once the user has answered whether anyone has allergies. */
  allergiesConfirmed: z.boolean().optional(),
  /** Allergies in the user's words; mapped to allergen keys by the app. */
  allergies: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** Non-allergy foods to avoid (religion, dislike, condition), in the user's words. */
  avoidFoods: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  availableIngredients: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  /**
   * What the user says they have right now ("now I have leftover beans and
   * bread"). Replaces availableIngredients instead of adding to it (ADR-055).
   */
  ingredientsNow: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  /** Foods the family cannot afford at the moment ("I can't afford chicken"). */
  unaffordableFoods: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** Minutes available to cook, when the user says so. */
  cookingMinutes: z.number().int().min(1).max(600).optional(),
  /** Planning food for school days (lunchboxes, breakfast before school) (ADR-058). */
  school: z.boolean().optional(),
  /** False when the user has no fridge (storage and lunchbox safety). */
  hasFridge: z.boolean().optional(),
  budgetNaira: z.number().positive().max(10_000_000).optional(),
  planDays: z.number().int().min(1).max(7).optional(),
  /** Nigerian state; anything that is not a known state or city is dropped. */
  state: z
    .string()
    .transform((s) => canonicalState(s))
    .optional(),
  mealPeriod: z.enum(["one_meal", "full_day", "several_days"]).optional().catch(undefined),
  breastfeeding: z.boolean().optional(),
  /** Medical conditions in the user's words; mapped to condition keys by the app. */
  conditions: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  takesMedication: z.boolean().optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
/**
 * What the app stores. `conditions` holds condition keys (not the model's
 * words), and `noticesShown` records which referral notices were already
 * given so they are not repeated (ADR-041); the model cannot set it.
 */
export type UserProfile = Omit<ProfileUpdate, "allergies" | "conditions"> & {
  conditions?: string[];
  noticesShown?: string[];
};

export const profileUpdateJsonSchema = {
  type: "object",
  description:
    "Only facts newly stated or changed in the latest user message. Omit anything not mentioned.",
  properties: {
    householdSize: { type: "integer", description: "Number of people being planned for." },
    members: {
      type: "array",
      description: "Everyone being planned for, if described. Give the full list when known.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: 'e.g. "adult", "son", "me"' },
          ageYears: { type: "number", description: "Age in years; 6 months = 0.5" },
        },
        required: ["label"],
      },
    },
    pregnant: { type: "boolean" },
    trimester: { type: "integer", enum: [1, 2, 3] },
    allergiesConfirmed: {
      type: "boolean",
      description: "True when the user has said whether anyone has food allergies (even 'none').",
    },
    allergies: { type: "array", items: { type: "string" } },
    avoidFoods: {
      type: "array",
      items: { type: "string" },
      description: "Foods to avoid for non-allergy reasons, e.g. pork.",
    },
    availableIngredients: {
      type: "array",
      items: { type: "string" },
      description: "Food the user says they already have at home (added to what is known).",
    },
    ingredientsNow: {
      type: "array",
      items: { type: "string" },
      description:
        "Only when the user describes what they have right now, replacing earlier stock (e.g. later in the week: 'now I only have leftover beans, bread and eggs').",
    },
    unaffordableFoods: {
      type: "array",
      items: { type: "string" },
      description: "Foods the user says they cannot afford right now, e.g. 'chicken'.",
    },
    cookingMinutes: {
      type: "integer",
      description: "Minutes the user has to cook, if said (e.g. 20).",
    },
    school: {
      type: "boolean",
      description: "True when the user is planning food for school days or lunchboxes.",
    },
    hasFridge: {
      type: "boolean",
      description: "False if the user says they have no fridge; true if they say they have one.",
    },
    budgetNaira: { type: "number" },
    planDays: { type: "integer", description: "Days the meal plan should cover (1-7)." },
    state: { type: "string", description: "Nigerian state or city the user lives in, if said." },
    breastfeeding: { type: "boolean" },
    conditions: {
      type: "array",
      items: { type: "string" },
      description:
        "Medical conditions the user mentions for anyone being planned for, e.g. diabetes.",
    },
    takesMedication: {
      type: "boolean",
      description: "True if the user says someone takes medication or supplements.",
    },
    mealPeriod: {
      type: "string",
      enum: ["one_meal", "full_day", "several_days"],
      description: "For budgets: is the money for one meal, a whole day, or several days?",
    },
  },
} as const;

function union(a: string[] = [], b: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const item of [...a, ...b]) {
    const key = normalizeText(item);
    if (key && !seen.has(key)) seen.set(key, item.trim());
  }
  return [...seen.values()];
}

export function mergeProfile(profile: UserProfile, update: ProfileUpdate | undefined): UserProfile {
  if (!update) return profile;
  const { allergies: _allergies, conditions: words, ingredientsNow, ...rest } = update;
  void _allergies; // allergies are merged as allergen keys by the orchestrator
  const conditions = [
    ...new Set([
      ...(profile.conditions ?? []),
      ...(words ?? []).flatMap((w) => detectConditions(w)),
    ]),
  ];
  return {
    ...profile,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    ...(update.members ? { members: update.members } : {}),
    avoidFoods: union(profile.avoidFoods, update.avoidFoods),
    // "What I have now" replaces the kitchen; anything else adds to it.
    availableIngredients: ingredientsNow?.length
      ? union(ingredientsNow, update.availableIngredients)
      : union(profile.availableIngredients, update.availableIngredients),
    ...(profile.unaffordableFoods?.length || update.unaffordableFoods?.length
      ? { unaffordableFoods: union(profile.unaffordableFoods, update.unaffordableFoods) }
      : {}),
    ...(conditions.length > 0 ? { conditions } : {}),
  };
}

export type SafetyContext = {
  infant: boolean;
  childUnder5: boolean;
  pregnant: boolean;
  /** Everyone being planned for is under 6 months old (the user is not pregnant or breastfeeding). */
  onlyBabiesUnder6Months?: boolean;
  breastfeeding?: boolean;
  conditions?: string[];
  takesMedication?: boolean;
};

export function safetyContextOf(profile: UserProfile): SafetyContext {
  const ages = (profile.members ?? []).flatMap((m) =>
    m.ageYears === undefined ? [] : [m.ageYears],
  );
  return {
    infant: ages.some((a) => a < 1),
    childUnder5: ages.some((a) => a < 5),
    pregnant: profile.pregnant === true,
    // A pregnant or breastfeeding user eats too, so food can be for them:
    // the household is then not only babies (e.g. "can I eat pineapple?"
    // after mentioning a 4-month-old).
    onlyBabiesUnder6Months:
      profile.pregnant !== true &&
      profile.breastfeeding !== true &&
      (profile.members?.length ?? 0) > 0 &&
      ages.length === profile.members!.length &&
      ages.every((a) => a < 0.5),
    breastfeeding: profile.breastfeeding === true,
    conditions: profile.conditions ?? [],
    takesMedication: profile.takesMedication === true,
  };
}

function describeMember(m: { label: string; ageYears?: number }): string {
  if (m.ageYears === undefined) return m.label;
  const age = m.ageYears < 1 ? `${Math.round(m.ageYears * 12)} months` : `${m.ageYears} years`;
  return `${m.label} (${age})`;
}

/** "Known facts" lines for the CURRENT USER CONTEXT prompt layer. */
export function knownFactLines(profile: UserProfile, allergies: string[]): string[] {
  const facts: string[] = [];
  const members = profile.members ?? [];
  if (profile.householdSize || members.length > 0) {
    const size = profile.householdSize ?? members.length;
    facts.push(
      `Planning for ${size} ${size === 1 ? "person" : "people"}${members.length > 0 ? `: ${members.map(describeMember).join(", ")}` : ""}.`,
    );
  }
  if (profile.pregnant) {
    facts.push(
      `The user is pregnant${profile.trimester ? `, trimester ${profile.trimester}` : ""}.`,
    );
  }
  if (allergies.length > 0) facts.push(`Allergies: ${allergies.map(allergenLabel).join(", ")}.`);
  else if (profile.allergiesConfirmed) facts.push("No food allergies (the user confirmed).");
  if (profile.avoidFoods?.length)
    facts.push(`Other foods to avoid: ${profile.avoidFoods.join(", ")}.`);
  if (profile.availableIngredients?.length) {
    facts.push(`Food already at home: ${profile.availableIngredients.join(", ")}.`);
  }
  if (profile.unaffordableFoods?.length) {
    facts.push(`Cannot afford right now: ${profile.unaffordableFoods.join(", ")}.`);
  }
  if (profile.cookingMinutes) facts.push(`Time to cook: about ${profile.cookingMinutes} minutes.`);
  if (profile.school) facts.push("Planning for school days.");
  if (profile.hasFridge === false) facts.push("No fridge: avoid leftovers that need chilling.");
  if (profile.hasFridge === true) facts.push("Has a fridge.");
  if (profile.budgetNaira) facts.push(`Budget: ₦${profile.budgetNaira.toLocaleString("en-NG")}.`);
  if (profile.planDays) facts.push(`Plan length: ${profile.planDays} day(s).`);
  if (profile.breastfeeding) facts.push("The user is breastfeeding.");
  if (profile.conditions?.length) {
    facts.push(`Medical conditions: ${profile.conditions.map(conditionLabel).join(", ")}.`);
  }
  if (profile.mealPeriod)
    facts.push(`The budget is for: ${MEAL_PERIOD_LABEL[profile.mealPeriod]}.`);
  if (profile.state) {
    const zone = zoneOfState(profile.state);
    facts.push(
      `Location: ${profile.state}${zone ? ` (prices use the ${REGION_LABEL[zone]})` : ""}.`,
    );
  }

  if (facts.length === 0) return [];
  return [`Known facts (never ask for these again): ${facts.join(" ")}`];
}

/**
 * What a meal plan still needs, most important first (CLAUDE.md §4 order:
 * who → ages → allergies → food at home). Plan length defaults to one day.
 */
const CHILD_WORDS =
  /\b(child|children|kids?|son|sons|daughters?|boys?|girls?|toddlers?|pikin|pickin|twins)\b/i;
const HAS_AGE =
  /\b\d{1,2}\s*(-|\s)?(years?|yrs?|months?|mths?)\b|\b(aged?|ages)\s+\d|\bare\s+\d{1,2}\s+and\s+\d{1,2}\b/i;

/**
 * Hints worked out in code from the latest message (ADR-055), so the next
 * question and the plan follow the review's priorities even when the model
 * would not: children's ages before anything else, and leftovers first.
 */
const EATING_PROBLEM =
  /\b(does ?n[o']?t|won'?t|will not|refuses?|refusing|hates?)\s+(like\s+to\s+)?(eat|eating|take|taking|want to eat)\b|\b(picky|fussy) eater\b|\bpoor appetite\b|\bnot eating\b/i;

/** Leftover foods the user names ("leftover beans"), for the leftover check. */
export function leftoversIn(message: string): string[] {
  return [...message.matchAll(/\bleft[- ]?over\s+([a-z]+(?:\s(?!and\b)[a-z]+)?)/gi)].map((m) =>
    m[1].toLowerCase(),
  );
}

const SCHOOL_WORDS = /\b(school|lunch ?box(es)?|lunch ?pack|packed lunch|break ?time|recess)\b/i;

/** "School meal planner" from the review (ADR-058): what to find out, and how to plan. */
export const SCHOOL_HINT =
  "School meal planning. Find out, one question at a time and only what is still unknown: the children's ages; how many school days to plan; whether they eat breakfast at home; what they can take and eat at school (lunchbox, snack, how long until they eat); foods they like or refuse; and, only if the user gave a budget, whether it covers school food only or all their food. Then plan Monday to Friday (or the days asked) with breakfast and the school food, set packed: true on food taken to school, choose food that is easy to eat and keeps well for several hours (more so with no fridge or a long wait), reuse the same ingredients across days, and keep it to realistic Nigerian options.";

/** "What do I have?" without saying what. */
const KITCHEN_ASK =
  /\b(food|what) (i|we) (already )?have\b|\bwith what (i|we) (already )?have\b|\bwhat do i have\b/i;
/** "What can I afford?" without an amount. */
const BUDGET_ASK = /\b(my|a|our) (food )?budget\b|\bwhat can (i|we) afford\b/i;

export function isSchoolMessage(message: string): boolean {
  return SCHOOL_WORDS.test(message);
}

export function conversationHints(message: string, profile: UserProfile): string[] {
  const hints: string[] = [];
  const agesKnown = (profile.members ?? []).some((m) => m.ageYears !== undefined);
  if (CHILD_WORDS.test(message) && !HAS_AGE.test(message) && !agesKnown) {
    hints.push(
      "The user mentioned children but not their ages. Your one question is how old they are; ask nothing else (not allergies) until you know.",
    );
  }
  // The two start modes (ADR-058): ask for what the mode is about first.
  const listsFood = /,|\band\b/i.test(message.replace(/\bwhat can i make\b/i, ""));
  if (KITCHEN_ASK.test(message) && !listsFood && !profile.availableIngredients?.length) {
    hints.push(
      "The user wants to cook with what they already have but has not said what it is. Your one question is what food they have in the kitchen right now.",
    );
  }
  if (BUDGET_ASK.test(message) && detectBudget(message) === undefined && !profile.budgetNaira) {
    hints.push(
      "The user wants to plan within a budget but has not said how much. Your one question is roughly how much they can spend.",
    );
  }
  // After the ages hint: ages come first, then the school checklist.
  if (profile.school || isSchoolMessage(message)) hints.push(SCHOOL_HINT);
  if (EATING_PROBLEM.test(message)) {
    hints.push(
      "The user describes an eating problem. Your one question is about that problem (what she has tried or tasted so far, what she accepts, which textures), not allergies or the planning checklist.",
    );
  }
  const leftovers = leftoversIn(message);
  if (leftovers.length > 0) {
    hints.push(
      `The user has leftover ${leftovers.join(", ")}. Build the meal around the leftovers first so nothing is wasted, and say so.`,
    );
  }
  return hints;
}

export function missingForMealPlan(profile: UserProfile, allergies: string[]): string[] {
  const missing: string[] = [];
  const members = profile.members ?? [];
  const size = profile.householdSize ?? members.length;

  // Asked together: "two children" already says who, so the next question is their ages.
  if (!size && !profile.pregnant) missing.push("who the meals are for and how old they are");
  else if (
    size > 1 &&
    members.filter((m) => m.ageYears !== undefined || /adult/i.test(m.label)).length < size
  ) {
    missing.push("roughly how old each person is (adults or children's ages)");
  }
  if (!profile.allergiesConfirmed && allergies.length === 0) {
    missing.push("whether anyone has food allergies or foods to avoid");
  }
  if (!profile.availableIngredients?.length) missing.push("what food they already have at home");
  return missing;
}

const MEAL_PERIOD_LABEL = {
  one_meal: "one meal",
  full_day: "a whole day",
  several_days: "several days",
} as const;

/**
 * What budget planning still needs, in the CLAUDE.md Journey C order:
 * food at home → how many people → one meal or the whole day.
 */
export function missingForBudget(profile: UserProfile): string[] {
  const missing: string[] = [];
  if (!profile.availableIngredients?.length) missing.push("what food they already have at home");
  if (!profile.householdSize && !profile.members?.length)
    missing.push("who they are feeding and how old they are");
  if (!profile.mealPeriod) missing.push("whether the money is for one meal or the whole day");
  return missing;
}

export function budgetGuidanceLines(profile: UserProfile): string[] {
  if (!profile.budgetNaira) return [];
  const missing = missingForBudget(profile);
  const intro = `The user has a food budget of ₦${profile.budgetNaira.toLocaleString("en-NG")}.`;
  if (missing.length === 0) {
    return [
      `${intro} You have enough information: suggest meals that use their food at home first. Every food a meal needs that they do not have MUST be in shoppingList (item, quantity, and forMeal naming the mealPlan dish); without it the app cannot show costs. Do not spend the whole budget; the app prices the list and shows the total and what is left.`,
    ];
  }
  return [
    `${intro} Before suggesting purchases, still unknown in priority order: ${missing.join("; ")}. Skip anything the latest message already answers. First give one useful, concrete point from what you already know (e.g. "you already have the base for a tomato rice meal, so I'd spend the money on protein and vegetables"), then ask only about the first unknown item. If the latest message answers them all, suggest meals and put every item to buy in shoppingList (item, quantity, and forMeal naming the mealPlan dish).`,
  ];
}

export function mealPlanGuidanceLines(profile: UserProfile, allergies: string[]): string[] {
  const missing = missingForMealPlan(profile, allergies);
  if (missing.length === 0) {
    return [
      "If the user wants a meal plan, you have enough information: produce it now in mealPlan (one day unless they asked for more).",
    ];
  }
  return [
    `If the user wants a meal plan, still unknown in priority order: ${missing.join("; ")}. Skip anything the latest message already answers. First give one useful, concrete point from what you already know (e.g. what the food they have is good for, or what kind of food to add), then ask only about the first unknown item. If the latest message already answers them all, produce the plan now and ask nothing else.`,
  ];
}

export function safetyContextLines(context: SafetyContext): string[] {
  const lines: string[] = [];
  if (context.infant) {
    lines.push(
      "A baby under 12 months is involved: no honey, no added salt or sugar, soft mashed textures, and the app checks every plan.",
    );
  }
  if (context.childUnder5) {
    lines.push(
      "A child under 5 is involved: no whole nuts or groundnuts and no hard round foods that could choke; describe meals as general ideas, never as medically right for the child.",
    );
  }
  if (context.onlyBabiesUnder6Months) {
    lines.push(
      "The only person involved is a baby under 6 months: WHO advises breast milk or infant formula only until about 6 months. Suggest no foods; refer to a child welfare clinic.",
    );
  }
  if (context.pregnant) {
    lines.push(
      "The user is pregnant: general guidance only, no supplement or medication doses. Never suggest alcohol (including palm wine), liver, raw or unpasteurised milk (such as nono), raw or undercooked eggs, meat or fish. The app checks every reply.",
    );
  }
  if (context.breastfeeding) {
    lines.push(
      "The user is breastfeeding: general guidance only; no alcohol, supplements or doses.",
    );
  }
  if (context.conditions && context.conditions.length > 0) {
    lines.push(
      `Medical conditions mentioned: ${context.conditions.map(conditionLabel).join(", ")}. Give general food guidance only, never diagnose or promise outcomes, and say their doctor or a registered dietitian can tailor advice.`,
    );
  }
  if (context.takesMedication) {
    lines.push(
      "Someone takes medication or supplements: never give doses, and never suggest starting, stopping or changing any medicine; say to keep taking it as prescribed and ask their doctor or pharmacist.",
    );
  }
  return lines;
}
