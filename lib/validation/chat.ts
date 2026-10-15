import { z } from "zod";
import { profileUpdateJsonSchema, profileUpdateSchema } from "@/lib/conversation/profile";
import { INTENTS } from "@/lib/conversation/types";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { mealPlanJsonSchema } from "@/lib/meals/plan";

import { MAX_MESSAGE_LENGTH } from "./limits";

export { MAX_MESSAGE_LENGTH, MAX_REQUEST_BYTES } from "./limits";

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`),
  // An unknown language falls back to the default instead of failing the message.
  language: z.enum(LANGUAGE_CODES).optional().catch(undefined),
  /** "voice" when the message was spoken, so the reply is written to be heard (ADR-055). */
  inputMode: z.enum(["text", "voice"]).optional().catch(undefined),
});

/** Validates structured output from any AI provider before the app trusts it. */
export const assistantResponseSchema = z.object({
  message: z.string().trim().min(1),
  /** The reply in English when message is in another language; used for safety checks (ADR-050). */
  englishMessage: z.string().trim().min(1).optional().catch(undefined),
  intent: z.enum(INTENTS).catch("unknown"),
  followUpQuestion: z.string().trim().min(1).optional(),
  safetyNotice: z.string().trim().min(1).optional(),
  recommendedFoods: z.array(z.string().trim().min(1)).max(50).optional(),
  // A malformed profile update is not worth failing the reply over.
  profileUpdate: profileUpdateSchema.optional().catch(undefined),
  shoppingList: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(60),
        quantity: z.number().positive(),
        forMeal: z.string().trim().min(1).max(100).optional().catch(undefined),
      }),
    )
    .max(30)
    .optional()
    .catch(undefined),
  fromHome: z.array(z.string().trim().min(1).max(60)).max(30).optional().catch(undefined),
  // Validated separately (lib/ai/parse.ts) so a malformed plan can be regenerated.
  mealPlan: z.unknown().optional(),
});

/** JSON Schema given to providers that support constrained JSON output. */
export const assistantResponseJsonSchema = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description:
        "The full reply shown to the user, in plain text. Simple '- ' bullets are allowed.",
    },
    englishMessage: {
      type: "string",
      description:
        "Only when message is not in English: the same reply in plain English, for the app to check.",
    },
    intent: { type: "string", enum: [...INTENTS] },
    followUpQuestion: {
      type: "string",
      description:
        "The single most useful next question, if one is needed. Must also appear in message.",
    },
    recommendedFoods: {
      type: "array",
      items: { type: "string" },
      description:
        "Every food or ingredient the reply suggests eating, cooking with or buying. Empty if none.",
    },
    safetyNotice: {
      type: "string",
      description: "Short professional-care note, only for safety-sensitive contexts.",
    },
    shoppingList: {
      type: "array",
      description:
        "Items to buy, each with a quantity in the unit of its price estimate (e.g. 0.5 for half a kg). No prices.",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          quantity: { type: "number" },
          forMeal: {
            type: "string",
            description: "The mealPlan dish name this item is bought for, if any.",
          },
        },
        required: ["item", "quantity"],
      },
    },
    fromHome: {
      type: "array",
      items: { type: "string" },
      description: "Food the user already has that your suggestion uses.",
    },
    profileUpdate: profileUpdateJsonSchema,
    mealPlan: mealPlanJsonSchema,
  },
  required: ["message", "intent"],
} as const;
