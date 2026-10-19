import { getChatProvider } from "@/lib/ai/settings/runtime";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import {
  ChatHistoryService,
  historyPolicy,
  PrismaHistoryRepository,
} from "@/lib/conversation/history";
import { PrismaPriceRepository } from "@/lib/budget/prisma-repository";
import { PriceService } from "@/lib/budget/service";
import { PrismaConversationStore } from "@/lib/conversation/prisma-store";
import { InMemoryConversationStore, type ConversationStore } from "@/lib/conversation/store";
import { getPrisma } from "@/lib/db";
import type { HandleChatDeps } from "@/lib/conversation/orchestrator";
import type { ChatHandlerDeps } from "@/lib/http/chat-handler";
import { PostgresRateLimiter } from "@/lib/http/postgres-rate-limit";
import { CHAT_RATE_LIMIT, InMemoryRateLimiter, type RateLimiter } from "@/lib/http/rate-limit";
import { PrismaFoodRepository } from "@/lib/nutrition/prisma-repository";
import { NutritionService } from "@/lib/nutrition/service";
import { findNutritionists } from "@/lib/nutritionists/directory";
import { isSpecialization } from "@/lib/nutritionists/specializations";
import { recommendProducts } from "@/lib/vendors/directory";
import { countQuietly } from "@/lib/vendors/stats";

let nutrition: NutritionService | undefined;
let prismaStore: PrismaConversationStore | undefined;
let postgresLimiter: PostgresRateLimiter | undefined;

/**
 * Postgres when a database is configured, so every server instance shares
 * conversations (ADR-039); in-memory only for local runs without one.
 */
const store: ConversationStore = process.env.DATABASE_URL
  ? {
      get: (id) => (prismaStore ??= new PrismaConversationStore(getPrisma())).get(id),
      save: (c) => (prismaStore ??= new PrismaConversationStore(getPrisma())).save(c),
    }
  : new InMemoryConversationStore();

/** Shared across instances when a database is configured (ADR-040). */
const rateLimiter: RateLimiter = process.env.DATABASE_URL
  ? {
      check: (key) =>
        (postgresLimiter ??= new PostgresRateLimiter(
          getPrisma(),
          CHAT_RATE_LIMIT.limit,
          CHAT_RATE_LIMIT.windowMs,
          process.env.RATE_LIMIT_SECRET || "nutraboom-equals-rate-limit",
        )).check(key),
    }
  : new InMemoryRateLimiter(CHAT_RATE_LIMIT.limit, CHAT_RATE_LIMIT.windowMs);
let prices: PriceService | undefined;

const shared = globalThis as unknown as { chatHistory?: ChatHistoryService };

/** Saved chats (ADR-090), with limits from the user's plan; needs the database. */
export function getChatHistory(): ChatHistoryService | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  shared.chatHistory ??= new ChatHistoryService(
    new PrismaHistoryRepository(getPrisma()),
    async (userId) => historyPolicy(await getEntitlementService().entitlementsFor({ userId })),
  );
  return shared.chatHistory;
}

/**
 * Everything a chat turn needs, shared by the website chat (/api/chat) and
 * WhatsApp (ADR-087), so both get the same data, limits and safety checks.
 */
export const chatDeps: ChatHandlerDeps = {
  getProvider: () => getChatProvider(),
  getNutrition: () => {
    if (!process.env.DATABASE_URL) return undefined;
    nutrition ??= new NutritionService(new PrismaFoodRepository(getPrisma()));
    return nutrition;
  },
  getNutritionists: () =>
    process.env.DATABASE_URL
      ? (query) =>
          findNutritionists(
            {
              state: query.state,
              specializations: query.specializations.filter(isSpecialization),
            },
            3,
          )
      : undefined,
  getProducts: () =>
    process.env.DATABASE_URL
      ? async (context) => {
          const cards = await recommendProducts(context);
          void countQuietly(
            cards.map((c) => c.id),
            "impressions",
          );
          return cards;
        }
      : undefined,
  getPrices: () => {
    if (!process.env.DATABASE_URL) return undefined;
    prices ??= new PriceService(new PrismaPriceRepository(getPrisma()));
    return prices;
  },
  store,
  rateLimiter,
  getViewer: async () =>
    process.env.DATABASE_URL ? ((await currentUser("web"))?.id ?? null) : null,
  get history() {
    return getChatHistory();
  },
};

/**
 * The dependencies for one chat turn outside /api/chat (WhatsApp, ADR-087).
 * Optional data sources degrade quietly, as they do in the chat handler.
 */
export async function chatTurnDeps(): Promise<HandleChatDeps> {
  const optional = <T>(get?: () => T | undefined): T | undefined => {
    try {
      return get?.();
    } catch {
      return undefined;
    }
  };
  return {
    provider: await chatDeps.getProvider(),
    store: chatDeps.store,
    nutrition: optional(chatDeps.getNutrition),
    prices: optional(chatDeps.getPrices),
    nutritionists: optional(chatDeps.getNutritionists),
    products: optional(chatDeps.getProducts),
  };
}
