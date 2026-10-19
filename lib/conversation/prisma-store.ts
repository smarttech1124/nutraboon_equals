import { z } from "zod";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { profileUpdateSchema } from "./profile";
import {
  capMessages,
  CONVERSATION_TTL_MS,
  ConversationStoreError,
  type ConversationStore,
} from "./store";
import { INTENTS, type Conversation } from "./types";

/** Expired rows are swept at most this often per server instance. */
const CLEANUP_INTERVAL_MS = 60 * 1000;

const storedMessagesSchema = z.array(
  z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
);
// App-only fields (noticesShown) must be listed or zod would strip them on read.
const storedProfileSchema = profileUpdateSchema
  .omit({ allergies: true })
  .extend({ noticesShown: z.array(z.string()).optional() });
const storedIntentSchema = z.enum(INTENTS).catch("unknown");

/**
 * Conversation state in PostgreSQL, shared by every server instance
 * (ADR-039). Each save slides the 2-hour expiry; expired rows are treated as
 * missing and deleted. Saved conversations (ADR-090) have no expiry here;
 * lib/conversation/history.ts applies their retention.
 */
export class PrismaConversationStore implements ConversationStore {
  private lastCleanup = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => number = Date.now,
  ) {}

  async get(id: string): Promise<Conversation | undefined> {
    let row;
    try {
      row = await this.prisma.conversation.findUnique({ where: { id } });
    } catch (error) {
      throw new ConversationStoreError("Could not load conversation", { cause: error });
    }
    if (!row || (row.expiresAt && row.expiresAt.getTime() <= this.now())) return undefined;

    const messages = storedMessagesSchema.safeParse(row.messages);
    const profile = storedProfileSchema.safeParse(row.profile);
    if (!messages.success || !profile.success) {
      // Unreadable state is unsafe to continue from; fail like an outage.
      throw new ConversationStoreError("Stored conversation failed validation");
    }
    return {
      id: row.id,
      messages: messages.data,
      currentIntent: storedIntentSchema.parse(row.currentIntent),
      allergies: row.allergies,
      profile: profile.data,
      updatedAt: row.updatedAt.getTime(),
      ...(row.userId ? { ownerId: row.userId } : {}),
    };
  }

  async save(conversation: Conversation): Promise<void> {
    const data = {
      messages: capMessages(conversation.messages),
      currentIntent: conversation.currentIntent,
      allergies: conversation.allergies,
      profile: conversation.profile,
      // A saved conversation keeps no fixed expiry: its owner's plan decides (ADR-090).
      ...(conversation.ownerId ? {} : { expiresAt: new Date(this.now() + CONVERSATION_TTL_MS) }),
    };
    try {
      await this.prisma.conversation.upsert({
        where: { id: conversation.id },
        create: { id: conversation.id, ...data },
        update: data,
      });
    } catch (error) {
      throw new ConversationStoreError("Could not save conversation", { cause: error });
    }
    await this.cleanupExpired();
  }

  /** Deletes expired conversations. Failures are ignored; the next save retries. */
  async cleanupExpired(): Promise<number> {
    const now = this.now();
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return 0;
    this.lastCleanup = now;
    try {
      const { count } = await this.prisma.conversation.deleteMany({
        where: { expiresAt: { lte: new Date(now) } },
      });
      return count;
    } catch {
      return 0;
    }
  }
}
