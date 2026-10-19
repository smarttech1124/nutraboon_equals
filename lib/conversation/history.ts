import { z } from "zod";
import type { Entitlements } from "@/lib/billing/entitlements";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ChatRole, HistoryStatus } from "./types";

/**
 * Saved chats for signed-in users (ADR-090). A chat is saved when its owner's
 * plan includes chat history and they are under their saved-chat limit; it is
 * then kept until they delete it or it goes unused for longer than their
 * plan's retention. Everything is enforced here, on the server: the browser
 * only shows the result. Guests' chats are never saved (2-hour expiry,
 * ADR-039).
 *
 * Limits come from the plan (chatHistory.* entitlements), so a plan change,
 * upgrade, downgrade or expiry applies at the next request:
 * - Over the limit after a downgrade: nothing is deleted. Existing saved
 *   chats can still be opened and continued; new chats are not saved until
 *   the user is under the limit again.
 * - History not included: saved chats stay listed so they can be deleted,
 *   but cannot be opened or continued; new chats are not saved.
 */

export type HistoryPolicy = { enabled: boolean; maxSaved: number; retentionDays: number };

export function historyPolicy(entitlements: Entitlements): HistoryPolicy {
  return {
    enabled: entitlements["chatHistory.enabled"],
    maxSaved: entitlements["chatHistory.maxSaved"],
    retentionDays: entitlements["chatHistory.retentionDays"],
  };
}

export type SavedChatSummary = { id: string; title: string; updatedAt: Date };
export type SavedChat = SavedChatSummary & {
  messages: { role: ChatRole; content: string }[];
};

export type ClaimResult = "saved" | "limit" | "missing";

export interface HistoryRepository {
  /** The user's saved chats, most recently used first. */
  list(userId: string): Promise<SavedChatSummary[]>;
  /** One of the user's saved chats; null if missing or someone else's. */
  get(userId: string, id: string): Promise<SavedChat | null>;
  /** Deletes one of the user's saved chats; false if it was not theirs. */
  delete(userId: string, id: string): Promise<boolean>;
  /**
   * Saves the conversation for the user, atomically per user: already theirs
   * is kept; an unsaved one is claimed only while they have fewer than `max`.
   * Someone else's conversation is never touched ("missing").
   */
  claim(userId: string, id: string, max: number): Promise<ClaimResult>;
  /** Deletes the user's saved chats last used before `cutoff`. */
  deleteUnusedBefore(userId: string, cutoff: Date): Promise<number>;
  /** Users with a saved chat last used before `cutoff`, for the daily sweep. */
  ownersWithUnusedBefore(cutoff: Date, limit: number): Promise<string[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Title length in the history list. */
export const TITLE_LENGTH = 80;

export function titleFrom(firstQuestion: string | undefined): string {
  const text = (firstQuestion ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Chat";
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : text;
}

export type OpenResult =
  { ok: true; chat: SavedChat } | { ok: false; reason: "not_found" | "unavailable" };

export class ChatHistoryService {
  constructor(
    private readonly repo: HistoryRepository,
    private readonly policyFor: (userId: string) => Promise<HistoryPolicy>,
    private readonly now: () => number = Date.now,
  ) {}

  policy(userId: string): Promise<HistoryPolicy> {
    return this.policyFor(userId);
  }

  private cutoff(policy: HistoryPolicy): Date {
    return new Date(this.now() - policy.retentionDays * DAY_MS);
  }

  /** The user's saved chats and their plan's limits; chats past retention are deleted first. */
  async list(userId: string): Promise<{ policy: HistoryPolicy; chats: SavedChatSummary[] }> {
    const policy = await this.policyFor(userId);
    await this.repo.deleteUnusedBefore(userId, this.cutoff(policy));
    return { policy, chats: await this.repo.list(userId) };
  }

  async open(userId: string, id: string): Promise<OpenResult> {
    const policy = await this.policyFor(userId);
    if (!policy.enabled) return { ok: false, reason: "unavailable" };
    const chat = await this.repo.get(userId, id);
    if (!chat || chat.updatedAt.getTime() < this.cutoff(policy).getTime()) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, chat };
  }

  remove(userId: string, id: string): Promise<boolean> {
    return this.repo.delete(userId, id);
  }

  /** After a chat turn: keeps the conversation in the user's history if the plan allows. */
  async save(
    userId: string,
    conversationId: string,
    policy?: HistoryPolicy,
  ): Promise<HistoryStatus> {
    const p = policy ?? (await this.policyFor(userId));
    if (!p.enabled) return { saved: false, reason: "unavailable" };
    const result = await this.repo.claim(userId, conversationId, p.maxSaved);
    if (result === "saved") return { saved: true };
    if (result === "limit") return { saved: false, reason: "limit", max: p.maxSaved };
    return { saved: false, reason: "unavailable" };
  }

  /** Daily: applies each owner's current retention to their saved chats. */
  async sweep(batch = 500): Promise<number> {
    // The shortest retention any plan can set, so no owner who might be due is missed.
    const owners = await this.repo.ownersWithUnusedBefore(new Date(this.now() - DAY_MS), batch);
    let deleted = 0;
    for (const userId of owners) {
      const policy = await this.policyFor(userId);
      deleted += await this.repo.deleteUnusedBefore(userId, this.cutoff(policy));
    }
    return deleted;
  }
}

const storedMessages = z.array(
  z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
);

/** Every query names the owner, so one user can never read or delete another's chats. */
export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<SavedChatSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });
    return rows.map((r) => ({ id: r.id, title: r.title ?? "Chat", updatedAt: r.updatedAt }));
  }

  async get(userId: string, id: string): Promise<SavedChat | null> {
    const row = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!row) return null;
    const messages = storedMessages.safeParse(row.messages);
    return {
      id: row.id,
      title: row.title ?? "Chat",
      updatedAt: row.updatedAt,
      messages: messages.success ? messages.data : [],
    };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.conversation.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async claim(userId: string, id: string, max: number): Promise<ClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      // One claim per user at a time, so two tabs cannot both take the last slot.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
      const row = await tx.conversation.findUnique({
        where: { id },
        select: { userId: true, title: true, messages: true },
      });
      if (!row || (row.userId && row.userId !== userId)) return "missing";
      const title =
        row.title ??
        titleFrom(
          (storedMessages.safeParse(row.messages).data ?? []).find((m) => m.role === "user")
            ?.content,
        );
      if (row.userId === userId) {
        if (!row.title) await tx.conversation.update({ where: { id }, data: { title } });
        return "saved";
      }
      if ((await tx.conversation.count({ where: { userId } })) >= max) return "limit";
      await tx.conversation.update({ where: { id }, data: { userId, title, expiresAt: null } });
      return "saved";
    });
  }

  async deleteUnusedBefore(userId: string, cutoff: Date): Promise<number> {
    const { count } = await this.prisma.conversation.deleteMany({
      where: { userId, updatedAt: { lt: cutoff } },
    });
    return count;
  }

  async ownersWithUnusedBefore(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId: { not: null }, updatedAt: { lt: cutoff } },
      distinct: ["userId"],
      select: { userId: true },
      take: limit,
    });
    return rows.flatMap((r) => (r.userId ? [r.userId] : []));
  }
}

type MemoryRow = SavedChat & { userId: string | null };

/** For tests: the same rules over a Map. */
export class InMemoryHistoryRepository implements HistoryRepository {
  readonly rows = new Map<string, MemoryRow>();

  add(row: MemoryRow) {
    this.rows.set(row.id, row);
  }

  async list(userId: string) {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  async get(userId: string, id: string) {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return { id: row.id, title: row.title, updatedAt: row.updatedAt, messages: row.messages };
  }

  async delete(userId: string, id: string) {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    return this.rows.delete(id);
  }

  async claim(userId: string, id: string, max: number): Promise<ClaimResult> {
    const row = this.rows.get(id);
    if (!row || (row.userId && row.userId !== userId)) return "missing";
    if (row.userId === userId) return "saved";
    if ((await this.list(userId)).length >= max) return "limit";
    row.userId = userId;
    row.title = titleFrom(row.messages.find((m) => m.role === "user")?.content);
    return "saved";
  }

  async deleteUnusedBefore(userId: string, cutoff: Date) {
    let n = 0;
    for (const row of [...this.rows.values()]) {
      if (row.userId === userId && row.updatedAt < cutoff) {
        this.rows.delete(row.id);
        n++;
      }
    }
    return n;
  }

  async ownersWithUnusedBefore(cutoff: Date, limit: number) {
    const owners = new Set<string>();
    for (const row of this.rows.values()) {
      if (row.userId && row.updatedAt < cutoff) owners.add(row.userId);
    }
    return [...owners].slice(0, limit);
  }
}
