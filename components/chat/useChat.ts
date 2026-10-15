"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatErrorResponse, ChatResponse, ChatRole } from "@/lib/conversation/types";
import type { BudgetSummary } from "@/lib/budget/summary";
import type { LanguageCode } from "@/lib/i18n/languages";
import type { MealPlan } from "@/lib/meals/plan";
import type { Outcome } from "@/lib/outcome/build";
import type { FoodReference } from "@/lib/nutrition/types";
import type { NutritionistCard } from "@/lib/nutritionists/types";
import type { Visual } from "@/lib/visuals/library";
import type { ProductCard } from "@/lib/vendors/types";

export type DataSource = { name: string; url: string };

export type UIMessage = {
  id: string;
  role: ChatRole;
  content: string;
  urgentNotice?: string;
  safetyNotice?: string;
  allergyNotice?: string;
  mealPlan?: MealPlan;
  budget?: BudgetSummary;
  outcome?: Outcome;
  sources?: DataSource[];
  nutritionists?: NutritionistCard[];
  products?: ProductCard[];
  visuals?: Visual[];
};

/** Distinct nutrition and serving-size sources behind a reply. */
export function collectSources(foods: FoodReference[] = []): DataSource[] {
  const byName = new Map<string, DataSource>();
  for (const food of foods) {
    byName.set(food.source, { name: food.source, url: food.sourceUrl });
    if (food.servingSource && food.servingSourceUrl && !byName.has(food.servingSource)) {
      byName.set(food.servingSource, { name: food.servingSource, url: food.servingSourceUrl });
    }
  }
  return [...byName.values()];
}

export type ChatState = {
  conversationId?: string;
  messages: UIMessage[];
  isLoading: boolean;
  error?: string;
};

const FALLBACK_ERROR = "I'm having trouble connecting right now. Please try again in a moment.";
export const OFFLINE_ERROR =
  "You seem to be offline. Check your internet connection and try again.";
export const TIMEOUT_ERROR = "That's taking longer than usual. Please try again.";
/** A little over the server's 60 s limit (maxDuration), so the server answers first when it can. */
export const REQUEST_TIMEOUT_MS = 70_000;

let nextId = 0;
const makeId = () => `m${++nextId}`;

/**
 * Client chat state. `sendMessage(text)` is the single entry point, so a
 * future voice input only needs to produce text and call it.
 */
export function useChat(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  language?: LanguageCode,
) {
  const [state, setState] = useState<ChatState>({ messages: [], isLoading: false });
  const pendingText = useRef<string | undefined>(undefined);
  const conversationId = useRef<string | undefined>(undefined);

  /** Whether the pending message was spoken, so a retry sends the same mode. */
  const pendingVoice = useRef(false);
  /** Bumped by clear(), so a reply to a cleared conversation is dropped. */
  const generation = useRef(0);

  const request = useCallback(
    async (text: string, viaVoice = false) => {
      pendingText.current = text;
      pendingVoice.current = viaVoice;
      const started = generation.current;
      const current = () => generation.current === started;
      setState((s) => ({ ...s, isLoading: true, error: undefined }));

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState((s) => ({ ...s, isLoading: false, error: OFFLINE_ERROR }));
        return;
      }

      // Never leave the user waiting forever on a hung request.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId.current,
            message: text,
            ...(language ? { language } : {}),
            ...(viaVoice ? { inputMode: "voice" } : {}),
          }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => undefined)) as
          ChatResponse | ChatErrorResponse | undefined;
        if (!current()) return;

        if (!res.ok || !data || "error" in data) {
          const message = data && "error" in data ? data.error.message : FALLBACK_ERROR;
          setState((s) => ({ ...s, isLoading: false, error: message }));
          return;
        }

        conversationId.current = data.conversationId;
        pendingText.current = undefined;
        setState((s) => ({
          conversationId: data.conversationId,
          isLoading: false,
          messages: [
            ...s.messages,
            {
              id: makeId(),
              role: "assistant",
              content: data.message,
              urgentNotice: data.metadata?.urgentNotice,
              safetyNotice: data.metadata?.safetyNotice,
              allergyNotice: data.metadata?.allergyNotice,
              mealPlan: data.metadata?.mealPlan,
              budget: data.metadata?.budget,
              outcome: data.metadata?.outcome,
              sources: collectSources(data.metadata?.foods),
              nutritionists: data.metadata?.nutritionists,
              products: data.metadata?.products,
              visuals: data.metadata?.visuals,
            },
          ],
        }));
      } catch {
        if (!current()) return;
        const error = controller.signal.aborted
          ? TIMEOUT_ERROR
          : typeof navigator !== "undefined" && navigator.onLine === false
            ? OFFLINE_ERROR
            : FALLBACK_ERROR;
        setState((s) => ({ ...s, isLoading: false, error }));
      } finally {
        clearTimeout(timer);
      }
    },
    [fetchImpl, timeoutMs, language],
  );

  const sendMessage = useCallback(
    (text: string, options: { viaVoice?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed || state.isLoading) return;
      setState((s) => ({
        ...s,
        messages: [...s.messages, { id: makeId(), role: "user", content: trimmed }],
      }));
      void request(trimmed, options.viaVoice);
    },
    [request, state.isLoading],
  );

  /** Re-sends the last failed message without adding it to the list again. */
  const retry = useCallback(() => {
    if (pendingText.current && !state.isLoading) {
      void request(pendingText.current, pendingVoice.current);
    }
  }, [request, state.isLoading]);

  /**
   * Starts a new conversation: messages, error and the server conversation
   * are forgotten on this device. A reply still on its way is ignored.
   */
  const clear = useCallback(() => {
    generation.current++;
    conversationId.current = undefined;
    pendingText.current = undefined;
    setState({ messages: [], isLoading: false });
  }, []);

  return { ...state, sendMessage, retry, clear };
}
