import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaHistoryRepository } from "@/lib/conversation/history";
import { PrismaConversationStore } from "@/lib/conversation/prisma-store";
import { createPrismaClient } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaWhatsAppRepository } from "@/lib/whatsapp/prisma-repository";

/**
 * Saved chats and WhatsApp RESET against a real, isolated PostgreSQL
 * database (ADR-090). Runs with `npm run test:db`.
 */
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = !!url && /test/i.test(new URL(url).pathname);

describe.skipIf(!isTestDatabase)("saved chats and WhatsApp reset (PostgreSQL)", () => {
  let prisma: PrismaClient;
  const userIds: string[] = [];

  beforeAll(() => {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = createPrismaClient(url!);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function user() {
    const u = await prisma.user.create({
      data: { email: `history-${randomUUID()}@example.test`, name: "Test", passwordHash: "!" },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function conversation(store: PrismaConversationStore, question: string) {
    const id = randomUUID();
    await store.save({
      id,
      messages: [
        { role: "user", content: question },
        { role: "assistant", content: "Answer" },
      ],
      currentIntent: "unknown",
      allergies: [],
      profile: {},
      updatedAt: Date.now(),
    });
    return id;
  }

  it("claims up to the limit even when requests race, and keeps saved chats without expiry", async () => {
    const store = new PrismaConversationStore(prisma);
    const repo = new PrismaHistoryRepository(prisma);
    const owner = await user();
    const ids = await Promise.all(
      ["a", "b", "c", "d", "e"].map((q) => conversation(store, `Question ${q}`)),
    );
    const results = await Promise.all(ids.map((id) => repo.claim(owner, id, 3)));
    expect(results.filter((r) => r === "saved")).toHaveLength(3);
    expect(results.filter((r) => r === "limit")).toHaveLength(2);

    const saved = await repo.list(owner);
    expect(saved).toHaveLength(3);
    const row = await prisma.conversation.findUnique({ where: { id: saved[0]!.id } });
    expect(row!.expiresAt).toBeNull();
    expect(row!.title).toMatch(/^Question [a-e]$/);

    // A later turn on a saved chat keeps it saved (no 2-hour expiry again).
    const loaded = await store.get(saved[0]!.id);
    expect(loaded!.ownerId).toBe(owner);
    await store.save(loaded!);
    expect(
      (await prisma.conversation.findUnique({ where: { id: saved[0]!.id } }))!.expiresAt,
    ).toBeNull();

    // Nobody else can read, delete or claim it.
    const other = await user();
    expect(await repo.get(other, saved[0]!.id)).toBeNull();
    expect(await repo.delete(other, saved[0]!.id)).toBe(false);
    expect(await repo.claim(other, saved[0]!.id, 3)).toBe("missing");
    expect(await repo.delete(owner, saved[0]!.id)).toBe(true);
  });

  it("RESET deletes the contact's conversation and message records, keeping the RESET itself", async () => {
    const store = new PrismaConversationStore(prisma);
    const repo = new PrismaWhatsAppRepository(prisma);
    const hash = `test-${randomUUID()}`;
    const contact = (await repo.recordInbound(hash, `wamid.${randomUUID()}`))!;
    const conversationId = await conversation(store, "My son is allergic to eggs");
    await repo.setConversation(contact.id, conversationId);
    await repo.recordOutbound(contact.id, `wamid.${randomUUID()}`);
    const resetId = `wamid.${randomUUID()}`;
    await repo.recordInbound(hash, resetId);

    await repo.reset(contact.id, resetId);
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
    const after = await prisma.whatsAppContact.findUnique({
      where: { id: contact.id },
      include: { messages: true },
    });
    expect(after!.conversationId).toBeNull();
    expect(after!.resetAt).not.toBeNull();
    expect(after!.messages.map((m) => m.id)).toEqual([resetId]);
    // The RESET message is still recognised if Meta retries it.
    expect(await repo.recordInbound(hash, resetId)).toBeNull();

    await repo.setPreferences(contact.id, { voiceReplies: "always", signVideos: true });
    const prefs = (await repo.recordInbound(hash, `wamid.${randomUUID()}`))!;
    expect(prefs).toMatchObject({ voiceReplies: "always", signVideos: true });
    await prisma.whatsAppContact.delete({ where: { id: contact.id } });
  });
});
