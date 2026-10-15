import type { Conversation } from "./types";

/**
 * Conversations expire after 2 hours of inactivity. They hold raw messages
 * and personal facts, so they are not kept longer (CLAUDE.md §28, ADR-039).
 */
export const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000;
/** Oldest turns are dropped beyond this, keeping storage bounded. */
export const MAX_STORED_MESSAGES = 40;
const MAX_CONVERSATIONS = 5000;

export interface ConversationStore {
  /** The conversation, or undefined if it never existed or has expired. */
  get(id: string): Promise<Conversation | undefined>;
  save(conversation: Conversation): Promise<void>;
}

/**
 * The store could not be read or written. The turn must fail rather than
 * continue without the conversation's saved facts (e.g. a declared allergy).
 */
export class ConversationStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConversationStoreError";
  }
}

export function capMessages<T>(messages: T[]): T[] {
  return messages.slice(-MAX_STORED_MESSAGES);
}

/**
 * Process-local store for tests and for running without a database. Not
 * shared between server instances, so not for production (ADR-039).
 */
export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(id: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    if (this.now() - conversation.updatedAt > CONVERSATION_TTL_MS) {
      this.conversations.delete(id);
      return undefined;
    }
    return conversation;
  }

  async save(conversation: Conversation): Promise<void> {
    // Re-insert so Map iteration order reflects recency for eviction.
    this.conversations.delete(conversation.id);
    this.conversations.set(conversation.id, {
      ...conversation,
      messages: capMessages(conversation.messages),
      updatedAt: this.now(),
    });

    if (this.conversations.size > MAX_CONVERSATIONS) {
      const oldest = this.conversations.keys().next().value;
      if (oldest) this.conversations.delete(oldest);
    }
  }
}
