"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatErrorResponse,
  ChatResponse,
  ChatRole,
  HistoryStatus,
} from "@/lib/conversation/types";
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
  /** From the last reply: whether a signed-in user's chat is saved (ADR-090). */
  history?: HistoryStatus;
};

/**
 * The open conversation is kept in this tab's sessionStorage (ADR-090), so a
 * reload or moving between pages does not lose it. It never leaves the
 * device, and closing the tab forgets it.
 */
export const SESSION_KEY = "nbe.chat";
const MAX_SESSION_MESSAGES = 40;

type SessionChat = { conversationId?: string; messages: UIMessage[] };

function readSession(): SessionChat | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as SessionChat;
    return Array.isArray(value.messages) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(chat: SessionChat | undefined) {
  try {
    if (!chat || chat.messages.length === 0) sessionStorage.removeItem(SESSION_KEY);
    else
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...chat, messages: chat.messages.slice(-MAX_SESSION_MESSAGES) }),
      );
  } catch {
    // Storage blocked or full: the chat still works, it just is not restored.
  }
}

const FALLBACK_ERROR = "I'm having trouble connecting right now. Please try again in a moment.";
export const OFFLINE_ERROR =
  "You seem to be offline. Check your internet connection and try again.";
export const TIMEOUT_ERROR = "That's taking longer than usual. Please try again.";
/** A little over the server's 60 s limit (maxDuration), so the server answers first when it can. */
export const REQUEST_TIMEOUT_MS = 70_000;

let nextId = 0;
// The time part keeps IDs unique across reloads, when restored messages keep their IDs.
const makeId = () => `m${++nextId}-${Date.now().toString(36)}`;

/**
 * Client chat state. `sendMessage(text)` is the single entry point, so a
 * future voice input only needs to produce text and call it.
 */
export function useChat(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  language?: LanguageCode,
  /** Keep the conversation in sessionStorage (the chat panel does; tests need not). */
  persist = false,
) {
  const [state, setState] = useState<ChatState>({ messages: [], isLoading: false });
  const pendingText = useRef<string | undefined>(undefined);
  const conversationId = useRef<string | undefined>(undefined);
  const restored = useRef(!persist);

  // Restore after mounting (the server render has no storage), then save on change.
  useEffect(() => {
    if (!persist) return;
    if (!restored.current) {
      restored.current = true;
      const saved = readSession();
      if (saved && saved.messages.length > 0) {
        // Applied after this render, like an update from any outside store.
        void Promise.resolve().then(() => {
          if (conversationId.current) return; // A new chat already started.
          conversationId.current = saved.conversationId;
          setState((s) =>
            s.messages.length > 0
              ? s
              : { ...s, conversationId: saved.conversationId, messages: saved.messages },
          );
        });
      }
      return;
    }
    writeSession({ conversationId: state.conversationId, messages: state.messages });
  }, [persist, state.conversationId, state.messages]);

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
          history: data.history,
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

  /** Opens a saved chat (ADR-090): its text messages, continuing the same conversation. */
  const restore = useCallback((id: string, messages: { role: ChatRole; content: string }[]) => {
    generation.current++;
    conversationId.current = id;
    pendingText.current = undefined;
    setState({
      conversationId: id,
      isLoading: false,
      history: { saved: true },
      messages: messages.map((m) => ({ id: makeId(), role: m.role, content: m.content })),
    });
  }, []);

  return { ...state, sendMessage, retry, clear, restore };
}
