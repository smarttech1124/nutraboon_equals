import type { NutritionistCard } from "@/lib/nutritionists/types";
import type { Visual } from "@/lib/visuals/library";
import type { ProductCard } from "@/lib/vendors/types";
import type { BudgetSummary } from "@/lib/budget/summary";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { MealPlan } from "@/lib/meals/plan";
import type { Outcome } from "@/lib/outcome/build";
import type { FoodReference } from "@/lib/nutrition/types";
import type { ProfileUpdate, UserProfile } from "./profile";

export const INTENTS = [
  "food_information",
  "meal_planning",
  "budget_planning",
  "shopping_list",
  "food_substitution",
  "general_nutrition",
  "safety_sensitive",
  "unknown",
] as const;

export type Intent = (typeof INTENTS)[number];

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** Structured reply produced by the AI layer and validated before use. */
export type AssistantResponse = {
  message: string;
  /** English version of message when the reply language is not English (ADR-050). */
  englishMessage?: string;
  intent: Intent;
  followUpQuestion?: string;
  safetyNotice?: string;
  /** Foods/ingredients the reply suggests; checked against declared allergies. */
  recommendedFoods?: string[];
  profileUpdate?: ProfileUpdate;
  /** Items to buy with quantities in each price unit; priced by the app, never by the model. */
  shoppingList?: { item: string; quantity: number; forMeal?: string }[];
  /** Food from home that the suggestion uses. */
  fromHome?: string[];
  mealPlan?: MealPlan;
  /** True when the provider returned a meal plan that failed validation. */
  invalidMealPlan?: boolean;
};

export type Conversation = {
  id: string;
  messages: ChatMessage[];
  currentIntent: Intent;
  /** Declared allergen keys (e.g. "peanut"); hard exclusions for the whole conversation. */
  allergies: string[];
  /** Facts the user has given (household, ages, food at home …); never asked again. */
  profile: UserProfile;
  updatedAt: number;
};

/** Public contract of POST /api/chat (CLAUDE.md §19). */
export type ChatRequest = {
  conversationId?: string;
  message: string;
  /** Reply language chosen in Settings (ADR-050). */
  language?: LanguageCode;
  /** How the message was entered (ADR-055). */
  inputMode?: "text" | "voice";
};

export type ChatResponse = {
  conversationId: string;
  message: string;
  intent: Intent;
  metadata?: {
    /** App-written "get care now" notice when emergency signs are described (ADR-041). */
    urgentNotice?: string;
    safetyNotice?: string;
    /** App-generated note about foods left out because of declared allergies. */
    allergyNotice?: string;
    /** A validated meal plan; the UI renders it as a card. */
    mealPlan?: MealPlan;
    foods?: FoodReference[];
    /** A shopping list priced by the app from NBS estimates. */
    budget?: BudgetSummary;
    /** The structured result shown first (ADR-051). */
    outcome?: Outcome;
    /** Verified nutritionists who could help, chosen by the app (ADR-064). */
    nutritionists?: NutritionistCard[];
    /** Sponsored products for foods in the reply, chosen by the app (ADR-067). */
    products?: ProductCard[];
    /** Reviewed pictures, when the person asked to see something (ADR-085). */
    visuals?: Visual[];
  };
};

export type ChatErrorResponse = {
  error: {
    code: "invalid_request" | "payload_too_large" | "rate_limited" | "ai_unavailable" | "internal";
    message: string;
  };
};
