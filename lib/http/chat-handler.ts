import { randomUUID } from "node:crypto";
import { AIProviderError, type AIProvider } from "@/lib/ai/types";
import { handleChat, type SafetyReport } from "@/lib/conversation/orchestrator";
import type { ChatHistoryService, HistoryPolicy } from "@/lib/conversation/history";
import { ConversationStoreError, type ConversationStore } from "@/lib/conversation/store";
import type { ChatErrorResponse, ChatResponse, HistoryStatus } from "@/lib/conversation/types";
import type { PriceLookup } from "@/lib/budget/service";
import type { NutritionLookup } from "@/lib/nutrition/service";
import { chatRequestSchema, MAX_REQUEST_BYTES } from "@/lib/validation/chat";
import {
  clientKey,
  RateLimitUnavailableError,
  type RateLimiter,
  type RateLimitResult,
} from "./rate-limit";
import type { NutritionistFinder } from "@/lib/nutritionists/types";
import type { ProductFinder } from "@/lib/vendors/types";
import { logChat } from "./log";

export const AI_UNAVAILABLE_MESSAGE =
  "I'm having trouble connecting right now. Please try again in a moment.";

export type ChatHandlerDeps = {
  /** May be async: the active provider can come from the database (ADR-047). */
  getProvider: () => AIProvider | Promise<AIProvider>;
  /** Optional so the chat still works when no food database is configured. */
  getNutrition?: () => NutritionLookup | undefined;
  /** Optional so the chat still works when no price data is configured. */
  getPrices?: () => PriceLookup | undefined;
  /** Optional: nutritionist suggestions need the database and the feature flag (ADR-064). */
  getNutritionists?: () => NutritionistFinder | undefined;
  /** Optional: sponsored products need the database and the Vendors flag (ADR-067). */
  getProducts?: () => ProductFinder | undefined;
  store: ConversationStore;
  rateLimiter: RateLimiter;
  /** The signed-in user's ID, or null for a guest (ADR-090). */
  getViewer?: () => Promise<string | null>;
  /** Saved chats; needs the database. */
  history?: ChatHistoryService;
};

/**
 * The store as this request may see it (ADR-090): a saved conversation opens
 * only for its owner, and only while their plan includes history. Anyone else
 * sending its ID gets a new conversation, never its messages or facts.
 */
export function scopedStore(
  store: ConversationStore,
  viewerId: string | null,
  historyEnabled: boolean,
): ConversationStore {
  return {
    get: async (id) => {
      const conversation = await store.get(id);
      if (!conversation?.ownerId) return conversation;
      return conversation.ownerId === viewerId && historyEnabled ? conversation : undefined;
    },
    save: (conversation) => store.save(conversation),
  };
}

function errorResponse(
  status: number,
  code: ChatErrorResponse["error"]["code"],
  message: string,
  requestId: string,
  headers: Record<string, string> = {},
): Response {
  const body: ChatErrorResponse = { error: { code, message } };
  return Response.json(body, { status, headers: { "x-request-id": requestId, ...headers } });
}

export function createChatHandler(deps: ChatHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = randomUUID();

    // If the limiter's storage is down, let the request through and log it:
    // a database blip should not lock every user out (ADR-040).
    let limit: RateLimitResult;
    let rateLimitDegraded = false;
    try {
      limit = await deps.rateLimiter.check(clientKey(request.headers));
    } catch (error) {
      if (!(error instanceof RateLimitUnavailableError)) throw error;
      limit = { allowed: true };
      rateLimitDegraded = true;
    }
    if (!limit.allowed) {
      logChat({ requestId, outcome: "failure", errorCategory: "rate_limited" });
      return errorResponse(
        429,
        "rate_limited",
        "You're sending messages a little fast. Please wait a moment and try again.",
        requestId,
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_REQUEST_BYTES) {
      return errorResponse(413, "payload_too_large", "That message is too long.", requestId);
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return errorResponse(413, "payload_too_large", "That message is too long.", requestId);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse(400, "invalid_request", "Invalid request.", requestId);
    }

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request.";
      return errorResponse(400, "invalid_request", message, requestId);
    }

    // Who is asking, and what their plan allows. A failure here only means
    // the chat is not saved: it never blocks the answer.
    let viewerId: string | null = null;
    let policy: HistoryPolicy | null = null;
    if (deps.getViewer && deps.history) {
      try {
        viewerId = await deps.getViewer();
        if (viewerId) policy = await deps.history.policy(viewerId);
      } catch {
        viewerId = null;
      }
    }

    const started = performance.now();
    let providerName: string | undefined;
    try {
      const provider = await deps.getProvider();
      providerName = provider.name;
      const degraded: string[] = rateLimitDegraded ? ["rate_limit_unavailable"] : [];
      let safety: SafetyReport | undefined;
      let nutrition: NutritionLookup | undefined;
      try {
        nutrition = deps.getNutrition?.();
      } catch {
        degraded.push("nutrition_unavailable");
      }
      let prices: PriceLookup | undefined;
      try {
        prices = deps.getPrices?.();
      } catch {
        degraded.push("prices_unavailable");
      }
      const result = await handleChat(parsed.data, {
        provider,
        store: scopedStore(deps.store, viewerId, policy?.enabled ?? false),
        nutrition,
        prices,
        nutritionists: deps.getNutritionists?.(),
        products: deps.getProducts?.(),
        onDegraded: (category) => degraded.push(category),
        onSafety: (report) => (safety = report),
      });
      let history: HistoryStatus | undefined;
      if (viewerId && policy && deps.history) {
        try {
          history = await deps.history.save(viewerId, result.conversationId, policy);
        } catch {
          degraded.push("history_unavailable");
        }
      }

      logChat({
        requestId,
        conversationId: result.conversationId,
        intent: result.intent,
        provider: providerName,
        aiLatencyMs: Math.round(performance.now() - started),
        outcome: "success",
        foodsMatched: result.metadata?.foods?.length ?? 0,
        ...(degraded.length > 0 ? { degraded } : {}),
        ...(safety ? { safety } : {}),
      });
      const body: ChatResponse = history ? { ...result, history } : result;
      return Response.json(body, { headers: { "x-request-id": requestId } });
    } catch (error) {
      const category =
        error instanceof AIProviderError
          ? error.category
          : error instanceof ConversationStoreError
            ? "store_unavailable"
            : "internal";
      logChat({
        requestId,
        conversationId: parsed.data.conversationId,
        provider: providerName,
        aiLatencyMs: Math.round(performance.now() - started),
        outcome: "failure",
        errorCategory: category,
      });
      if (error instanceof AIProviderError || error instanceof ConversationStoreError) {
        return errorResponse(503, "ai_unavailable", AI_UNAVAILABLE_MESSAGE, requestId);
      }
      return errorResponse(500, "internal", AI_UNAVAILABLE_MESSAGE, requestId);
    }
  };
}
