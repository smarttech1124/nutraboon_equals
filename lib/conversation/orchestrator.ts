import { randomUUID } from "node:crypto";
import { AIProviderError, type AIProvider, type AIRequest, type AIResponse } from "@/lib/ai/types";
import { buildSystemPrompt, type PromptContext } from "@/lib/ai/prompts";
import { checkBudgetReply } from "@/lib/budget/check";
import { detectBudget } from "@/lib/budget/money";
import type { PriceBook } from "@/lib/budget/prices";
import { zoneOfState, detectState, type Region } from "@/lib/budget/regions";
import type { PriceLookup } from "@/lib/budget/service";
import { buildBudgetSummary, formatPriceFacts, type BudgetSummary } from "@/lib/budget/summary";
import { isEnglish, type LanguageCode } from "@/lib/i18n/languages";
import { planFoods, planReasons } from "@/lib/meals/plan";
import { buildOutcome, type Outcome } from "@/lib/outcome/build";
import { formatFoodFacts, toFoodReference } from "@/lib/nutrition/facts";
import { normalizeText } from "@/lib/nutrition/match";
import type { NutritionLookup } from "@/lib/nutrition/service";
import type { FoodRecord } from "@/lib/nutrition/types";
import {
  allergyContextLines,
  allergyFallbackMessage,
  allergyNotice,
  detectDeclaredAllergies,
  detectNoAllergies,
  findAllergenTerms,
  findConflictingMentions,
} from "@/lib/safety/allergy";
import {
  detectBreastfeeding,
  detectConditions,
  detectMedication,
  detectPregnancy,
  detectRedFlags,
  urgentCareNotice,
} from "@/lib/safety/context";
import { checkMedicalRules } from "@/lib/safety/medical-rules";
import { checkNutrientClaims } from "@/lib/safety/nutrient-claims";
import { referralNotice, sensitiveCategories } from "@/lib/safety/referrals";
import { specializationsFor } from "@/lib/nutritionists/specializations";
import type { NutritionistCard, NutritionistFinder } from "@/lib/nutritionists/types";
import { productMoment, recentConversationText } from "@/lib/vendors/product-moment";
import { findVisuals, wantsVisual } from "@/lib/visuals/match";
import type { ProductCard, ProductFinder } from "@/lib/vendors/types";
import { checkReply, correctionFor, type SafetyViolation } from "@/lib/safety/reply-check";
import {
  budgetGuidanceLines,
  conversationHints,
  isSchoolMessage,
  leftoversIn,
  knownFactLines,
  mealPlanGuidanceLines,
  mergeProfile,
  safetyContextLines,
  safetyContextOf,
  type UserProfile,
} from "./profile";
import type { ConversationStore } from "./store";
import type { ChatMessage, ChatResponse, Conversation } from "./types";

/** How many prior messages are sent to the model as context. */
export const MAX_CONTEXT_MESSAGES = 20;

export type HandleChatInput = {
  conversationId?: string;
  message: string;
  /** Reply language chosen on the device (ADR-050). Defaults to Nigerian English. */
  language?: LanguageCode;
  /** "voice": the reply is written to be heard (ADR-055). */
  inputMode?: "text" | "voice";
};

/** Safety checks that ran for this turn, for logging (counts only, no content). */
export type SafetyReport = {
  violations: number;
  regenerated: boolean;
  usedFallback: boolean;
};

export type HandleChatDeps = {
  provider: AIProvider;
  store: ConversationStore;
  nutrition?: NutritionLookup;
  prices?: PriceLookup;
  /** Called when an optional step fails but the turn can still continue. */
  onDegraded?: (category: string) => void;
  onSafety?: (report: SafetyReport) => void;
  /** Suggests verified nutritionists when professional help fits (ADR-064). */
  nutritionists?: NutritionistFinder;
  /** Sponsored products for foods the reply suggests (ADR-067). */
  products?: ProductFinder;
};

/** The user asks for a person, not just advice. */
const NUTRITIONIST_CUE = /\b(nutritionists?|dietitians?|dieticians?)\b/i;

/** A reply in another language must also come in English, so the checks can read it. */
const MISSING_ENGLISH: SafetyViolation = {
  kind: "format",
  term: "englishMessage",
  reason: "englishMessage is required: give the same reply in plain English",
};

const MALFORMED_PLAN: SafetyViolation = {
  kind: "format",
  term: "mealPlan",
  reason: "the meal plan was incomplete or malformed; every meal needs mealType, name and foods",
};

function fallbackMessage(allergies: string[], violations: SafetyViolation[]): string {
  if (allergies.length > 0 && violations.some((v) => v.kind === "allergy")) {
    return allergyFallbackMessage(allergies);
  }
  if (violations.some((v) => v.kind === "medication")) {
    return "I can't advise on medicine doses or changes. Please keep taking any medicine as prescribed and ask your doctor or pharmacist about it. I'm happy to help with food ideas.";
  }
  return "I couldn't put together suggestions that safely meet everything you told me. Could you tell me which foods you'd like to use? I'll build around them.";
}

/** Words that mean the user is asking about money, so price estimates are worth loading. */
const PRICE_CUE = /₦|\bnaira\b|\bbudget\b|\bprice|\bcost|how much|\bbuy\b|shopping|market/i;

/** Allergen keys from the model's profileUpdate, mapped through the app's vocabulary. */
function allergensFromModel(reply: AIResponse): string[] {
  return (reply.profileUpdate?.allergies ?? []).flatMap((a) =>
    findAllergenTerms(a).flatMap((m) => m.allergens),
  );
}

/**
 * Runs one chat turn. The user's message is only persisted once the provider
 * succeeds, so a retry after a failure does not duplicate it.
 *
 * Every reply passes deterministic checks before the user sees it (ADR-009,
 * ADR-017): declared allergies, other foods to avoid, child-feeding rules and
 * meal-plan shape. A failing reply is regenerated once with a correction and
 * replaced by a safe fallback if it still fails.
 */
export async function handleChat(
  input: HandleChatInput,
  deps: HandleChatDeps,
): Promise<ChatResponse> {
  // A store failure throws (ConversationStoreError): never continue a
  // conversation without its saved facts, such as a declared allergy.
  const existing = input.conversationId ? await deps.store.get(input.conversationId) : undefined;
  const conversation: Conversation = existing ?? {
    id: randomUUID(),
    messages: [],
    currentIntent: "unknown",
    allergies: [],
    profile: {},
    updatedAt: Date.now(),
  };

  const allergies = [
    ...new Set([...conversation.allergies, ...detectDeclaredAllergies(input.message)]),
  ];
  // Foods the user named that conflict with an allergy (e.g. "we have groundnut oil").
  const userConflicts = findConflictingMentions(input.message, allergies);

  // Food data is helpful but optional: without it the prompt already forbids
  // quoting figures, so a database outage degrades answers instead of failing them.
  let foods: FoodRecord[] = [];
  if (deps.nutrition) {
    try {
      // Never feed the model nutrition facts for a food the user must avoid
      // (e.g. "allergic to peanuts" would otherwise pull in groundnut data).
      foods = (await deps.nutrition.findFoodsInMessage(input.message)).filter(
        (food) => !food.allergens.some((a) => allergies.includes(a)),
      );
    } catch {
      deps.onDegraded?.("nutrition_unavailable");
    }
  }

  const userMessage: ChatMessage = { role: "user", content: input.message };
  const context = [...conversation.messages, userMessage].slice(-MAX_CONTEXT_MESSAGES);
  // For checks that accept what the user said (their own dose instructions)
  // or what earlier, already-checked replies said (ADR-055).
  const userText = [...conversation.messages, userMessage]
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const conversationText = [...conversation.messages, userMessage].map((m) => m.content).join("\n");
  const detected = {
    ...(detectBudget(input.message) !== undefined
      ? { budgetNaira: detectBudget(input.message) }
      : {}),
    ...(detectState(input.message) ? { state: detectState(input.message) } : {}),
    ...(detectPregnancy(input.message) ?? {}),
    ...(detectBreastfeeding(input.message) ? { breastfeeding: true } : {}),
    ...(detectConditions(input.message).length > 0
      ? { conditions: detectConditions(input.message) }
      : {}),
    ...(detectMedication(input.message) ? { takesMedication: true } : {}),
    ...(isSchoolMessage(input.message) ? { school: true } : {}),
  };
  const redFlags = detectRedFlags(input.message);
  const leftovers = leftoversIn(input.message);
  const profile: UserProfile = mergeProfile(conversation.profile, detected);
  const region: Region = zoneOfState(profile.state) ?? "national";

  // Price estimates are optional like food data: without them the model may
  // not quote any price, and shopping lists are shown without costs.
  let book: PriceBook | undefined;
  let pricesFailed = false;
  const loadPrices = async () => {
    if (book || pricesFailed || !deps.prices) return book;
    try {
      book = await deps.prices.priceBook(region);
    } catch {
      pricesFailed = true; // one failure per turn is enough to log
      deps.onDegraded?.("prices_unavailable");
    }
    return book;
  };
  if (profile.budgetNaira || PRICE_CUE.test(input.message)) await loadPrices();
  // Reviewed pictures are chosen by code before the reply, so the reply can
  // refer to them; the AI never picks or invents images (ADR-085).
  const visuals = findVisuals(
    input.message,
    recentConversationText(conversation.messages, input.message),
  );
  const visualLines = visuals.length
    ? [
        `The app will show these reviewed pictures with your reply: ${visuals.map((v) => `"${v.title}" (${v.caption})`).join("; ")}. Refer to them as "the picture" where it helps, but still explain fully in words, step by step, so the reply works without seeing them.`,
      ]
    : wantsVisual(input.message)
      ? [
          "The person asked to see a picture, but no reviewed picture is available for this topic. Explain clearly in words, step by step, and say briefly that a picture of this is not available here yet. Never describe an image as attached or shown.",
        ]
      : [];
  const promptBase: PromptContext = {
    userContext: [
      ...(redFlags.length > 0
        ? [
            `URGENT: the user describes possible emergency signs (${redFlags.join(", ")}). Start your message by telling them to get medical care now (nearest hospital or call 112). Do not suggest home remedies instead of care.`,
          ]
        : []),
      ...knownFactLines(profile, allergies),
      ...conversationHints(input.message, profile),
      ...visualLines,
      ...allergyContextLines(allergies, userConflicts),
      ...safetyContextLines(safetyContextOf(profile)),
      ...mealPlanGuidanceLines(profile, allergies),
      ...budgetGuidanceLines(profile),
    ],
    verifiedData: [...foods.map(formatFoodFacts), ...(book ? formatPriceFacts(book) : [])],
    language: input.language,
    voice: input.inputMode === "voice",
  };
  const needsEnglish = !isEnglish(input.language);

  // Checks use this turn's facts too, so "my baby is 8 months" in the same
  // message as a plan request already applies the infant rules.
  const check = (reply: AIResponse) => {
    const turnProfile = mergeProfile(profile, reply.profileUpdate);
    const turnAllergies = [...new Set([...allergies, ...allergensFromModel(reply)])];
    // Both texts are checked: local food names (e.g. "epa") appear in the
    // translated message, English ones in its English version (ADR-050).
    const checkedText = [
      reply.message,
      reply.englishMessage ?? "",
      // The "why" line under each meal is model text too.
      ...planReasons(reply.mealPlan),
    ].join("\n");
    const violations = checkReply(
      {
        message: checkedText,
        recommendedFoods: [
          ...(reply.recommendedFoods ?? []),
          ...(reply.shoppingList ?? []).map((i) => i.item),
        ],
        planItems: planFoods(reply.mealPlan),
      },
      {
        allergies: turnAllergies,
        avoidFoods: turnProfile.avoidFoods,
        unaffordableFoods: turnProfile.unaffordableFoods,
        safety: safetyContextOf(turnProfile),
      },
    );
    violations.push(
      ...checkBudgetReply(
        { ...reply, message: checkedText },
        { budget: turnProfile.budgetNaira, book },
      ),
    );
    const turnSafety = safetyContextOf(turnProfile);
    violations.push(
      ...checkMedicalRules(
        {
          message: checkedText,
          suggested: [
            ...(reply.recommendedFoods ?? []),
            ...(reply.shoppingList ?? []).map((i) => i.item),
            ...planFoods(reply.mealPlan),
          ],
        },
        {
          pregnant: turnSafety.pregnant,
          onlyBabiesUnder6Months: turnSafety.onlyBabiesUnder6Months,
          userText,
        },
      ),
    );
    violations.push(
      ...checkNutrientClaims(checkedText, {
        verifiedData: (promptBase.verifiedData ?? []).join("\n"),
        conversationText,
      }),
    );
    if (needsEnglish && !reply.englishMessage) violations.push(MISSING_ENGLISH);
    // Leftovers the user named this turn must be used when the reply suggests food (ADR-055).
    const suggestedText = normalizeText(
      [...(reply.recommendedFoods ?? []), ...planFoods(reply.mealPlan), checkedText].join(" "),
    );
    const suggestsFood = (reply.recommendedFoods?.length ?? 0) > 0 || Boolean(reply.mealPlan);
    for (const leftover of suggestsFood ? leftovers : []) {
      const word = normalizeText(leftover).split(" ")[0];
      if (word && !suggestedText.includes(word)) {
        violations.push({
          kind: "format",
          term: `leftover ${leftover}`,
          reason: `the user has leftover ${leftover}; build a meal around it so it is not wasted`,
        });
      }
    }
    return reply.invalidMealPlan ? [...violations, MALFORMED_PLAN] : violations;
  };

  // A reply in the wrong shape is asked for once more before the user sees
  // an error: models occasionally drop a required field (ADR-055).
  const generate = async (request: AIRequest): Promise<AIResponse> => {
    try {
      return await deps.provider.generateResponse(request);
    } catch (error) {
      if (!(error instanceof AIProviderError) || error.category !== "invalid_output") throw error;
      deps.onDegraded?.("invalid_output_retried");
      return deps.provider.generateResponse(request);
    }
  };

  let reply: AIResponse = await generate({
    systemPrompt: buildSystemPrompt(promptBase),
    messages: context,
  });
  const report: SafetyReport = { violations: 0, regenerated: false, usedFallback: false };

  let violations = check(reply);
  if (violations.length > 0) {
    report.violations = violations.length;
    report.regenerated = true;
    const first = reply;
    reply = await generate({
      systemPrompt: buildSystemPrompt({ ...promptBase, correction: correctionFor(violations) }),
      messages: context,
    });
    violations = check(reply);
    if (violations.length > 0) {
      report.usedFallback = true;
      reply = {
        message: fallbackMessage(allergies, violations),
        intent: "safety_sensitive",
        recommendedFoods: [],
        // Facts the user gave are still worth keeping.
        profileUpdate: first.profileUpdate,
      };
    }
  }
  if (report.regenerated || allergies.length > 0) deps.onSafety?.(report);

  // What the user said outright wins over the model's reading of it.
  const nextProfile = mergeProfile(mergeProfile(profile, reply.profileUpdate), detected);
  const nextAllergies = [...new Set([...allergies, ...allergensFromModel(reply)])];
  if (nextAllergies.length > 0 || detectNoAllergies(input.message)) {
    nextProfile.allergiesConfirmed = true;
  }

  // A referral is shown the first time each sensitive situation appears
  // (ADR-041). The model's own notice is kept; the app fills in when it gave none.
  const categories = sensitiveCategories(safetyContextOf(nextProfile));
  const shown = new Set(nextProfile.noticesShown ?? []);
  const newCategories = categories.filter((c) => !shown.has(c));
  const safetyNotice =
    reply.safetyNotice ?? (newCategories.length > 0 ? referralNotice(newCategories) : undefined);
  nextProfile.noticesShown = [...new Set([...shown, ...categories])];
  const urgentNotice = urgentCareNotice(redFlags);

  // Nutritionist suggestions (ADR-064): when a new sensitive situation gets a
  // referral, or the user asks for one. Never in an emergency, where the
  // message is to get care now.
  let nutritionists: NutritionistCard[] | undefined;
  const referralCategories = newCategories.filter((c) => c !== "medication");
  if (
    deps.nutritionists &&
    !urgentNotice &&
    (referralCategories.length > 0 || NUTRITIONIST_CUE.test(input.message))
  ) {
    try {
      const found = await deps.nutritionists({
        specializations: specializationsFor(
          referralCategories.length > 0 ? referralCategories : categories,
          nextAllergies.length > 0,
        ),
        state: nextProfile.state ?? null,
      });
      if (found.length > 0) nutritionists = found.slice(0, 3);
    } catch {
      deps.onDegraded?.("nutritionists_unavailable");
    }
  }

  await deps.store.save({
    ...conversation,
    messages: [
      ...conversation.messages,
      userMessage,
      { role: "assistant", content: reply.message },
    ],
    currentIntent: reply.intent,
    allergies: nextAllergies,
    profile: nextProfile,
  });

  const suggestsFoods =
    (reply.recommendedFoods?.length ?? 0) > 0 ||
    (reply.shoppingList?.length ?? 0) > 0 ||
    planFoods(reply.mealPlan).length > 0;

  let budget: BudgetSummary | undefined;
  if (reply.shoppingList?.length && (await loadPrices())) {
    budget = buildBudgetSummary(reply.shoppingList, book!, {
      budget: nextProfile.budgetNaira,
      fromHome: reply.fromHome,
    });
  }
  const outcome = await buildTurnOutcome(reply, budget, foods, nextAllergies, nextProfile, deps);

  // Sponsored products only at the right moment: when the person asks for
  // products, turns to buying, or is wrapping up (ADR-078). Only for foods
  // the reply suggests or the conversation discussed, never in an emergency,
  // and filtered by the same allergy and safety rules (ADR-067).
  let products: ProductCard[] | undefined;
  const moment = productMoment(input.message, reply, conversation.messages);
  const productTerms = [
    ...(reply.recommendedFoods ?? []),
    ...(reply.shoppingList ?? []).map((i) => i.item),
    ...planFoods(reply.mealPlan),
  ];
  const recentText =
    moment === "asked" || moment === "closing"
      ? recentConversationText(conversation.messages, input.message)
      : undefined;
  if (
    deps.products &&
    moment &&
    !urgentNotice &&
    reply.intent !== "safety_sensitive" &&
    (productTerms.length > 0 || recentText)
  ) {
    const safety = safetyContextOf(nextProfile);
    try {
      const found = await deps.products({
        terms: productTerms,
        allergies: nextAllergies,
        avoidFoods: nextProfile.avoidFoods,
        infant: safety.infant,
        childUnder5: safety.childUnder5,
        pregnant: safety.pregnant,
        state: nextProfile.state ?? null,
        limit: 2,
        ...(recentText ? { recentText } : {}),
      });
      if (found.length > 0) products = found;
    } catch {
      deps.onDegraded?.("products_unavailable");
    }
  }
  const notice = allergyNotice(nextAllergies, userConflicts, suggestsFoods);
  const metadata: ChatResponse["metadata"] = {
    ...(urgentNotice ? { urgentNotice } : {}),
    ...(safetyNotice ? { safetyNotice } : {}),
    ...(notice ? { allergyNotice: notice } : {}),
    ...(reply.mealPlan ? { mealPlan: reply.mealPlan } : {}),
    ...(budget ? { budget } : {}),
    ...(outcome ? { outcome: outcome.outcome } : {}),
    ...(nutritionists ? { nutritionists } : {}),
    ...(products ? { products } : {}),
    ...(visuals.length > 0 ? { visuals } : {}),
    ...(foods.length > 0 || outcome?.sources.length
      ? {
          foods: [
            ...new Map(
              [...foods, ...(outcome?.sources ?? [])].map((f) => [f.id, toFoodReference(f)]),
            ).values(),
          ],
        }
      : {}),
  };

  return {
    conversationId: conversation.id,
    message: reply.message,
    intent: reply.intent,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * The outcome card for this turn (ADR-051). Food data is optional: without
 * it the card still shows the plan and costs, just no nutrition highlights.
 */
async function buildTurnOutcome(
  reply: AIResponse,
  budget: BudgetSummary | undefined,
  askedFoods: FoodRecord[],
  allergies: string[],
  profile: UserProfile,
  deps: HandleChatDeps,
): Promise<{ outcome: Outcome; sources: FoodRecord[] } | undefined> {
  const suggestedNames = [
    ...planFoods(reply.mealPlan),
    ...(reply.shoppingList ?? []).map((i) => i.item),
    ...(budget?.fromHome ?? []),
  ];
  let suggestedFoods: FoodRecord[] = [];
  let thresholds;
  const nutrition = deps.nutrition;
  if (nutrition?.nutrientThresholds && (suggestedNames.length > 0 || askedFoods.length > 0)) {
    try {
      thresholds = await nutrition.nutrientThresholds();
      if (suggestedNames.length > 0 && nutrition.findFoods) {
        // Never highlight a food the user must avoid.
        suggestedFoods = (await nutrition.findFoods(suggestedNames)).filter(
          (f) => !f.allergens.some((a) => allergies.includes(a)),
        );
      }
    } catch {
      deps.onDegraded?.("outcome_nutrition_unavailable");
    }
  }
  const people = profile.householdSize ?? profile.members?.length;
  const outcome = buildOutcome({
    mealPlan: reply.mealPlan,
    budget,
    // Facts cards only for a food question, not alongside a plan.
    askedFoods: reply.intent === "food_information" ? askedFoods : [],
    suggestedFoods,
    thresholds,
    ...(people ? { people } : {}),
    ...(profile.budgetNaira ? { budgetNaira: profile.budgetNaira } : {}),
  });
  if (!outcome) return undefined;
  const focusNames = new Set(outcome.nutritionFocus?.flatMap((n) => n.foods) ?? []);
  return { outcome, sources: suggestedFoods.filter((f) => focusNames.has(f.name)) };
}
