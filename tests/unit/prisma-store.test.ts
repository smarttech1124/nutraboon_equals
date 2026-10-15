import { describe, expect, it, vi } from "vitest";
import { PrismaConversationStore } from "@/lib/conversation/prisma-store";
import {
  CONVERSATION_TTL_MS,
  ConversationStoreError,
  MAX_STORED_MESSAGES,
} from "@/lib/conversation/store";
import type { Conversation } from "@/lib/conversation/types";
import type { PrismaClient } from "@/lib/generated/prisma/client";

type Row = {
  id: string;
  messages: unknown;
  currentIntent: string;
  allergies: string[];
  profile: unknown;
  updatedAt: Date;
  expiresAt: Date;
};

/** Minimal stand-in for prisma.conversation, backed by a Map. */
function fakePrisma(now: () => number) {
  const rows = new Map<string, Row>();
  const conversation = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
    upsert: vi.fn(
      async (args: { where: { id: string }; create: Omit<Row, "updatedAt">; update: object }) => {
        const existing = rows.get(args.where.id);
        rows.set(args.where.id, {
          ...(existing ?? args.create),
          ...args.update,
          updatedAt: new Date(now()),
        } as Row);
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { expiresAt: { lte: Date } } }) => {
      let count = 0;
      for (const [id, row] of rows) {
        if (row.expiresAt <= where.expiresAt.lte) {
          rows.delete(id);
          count++;
        }
      }
      return { count };
    }),
  };
  return { prisma: { conversation } as unknown as PrismaClient, conversation, rows };
}

const sample = (id = "c1"): Conversation => ({
  id,
  messages: [
    { role: "user", content: "My son is allergic to peanuts." },
    { role: "assistant", content: "Noted." },
  ],
  currentIntent: "meal_planning",
  allergies: ["peanut"],
  profile: { householdSize: 3, members: [{ label: "son", ageYears: 4 }], state: "Lagos" },
  updatedAt: 0,
});

describe("PrismaConversationStore", () => {
  it("round-trips a conversation with its allergies and profile", async () => {
    const now = () => 1_000_000;
    const { prisma } = fakePrisma(now);
    const store = new PrismaConversationStore(prisma, now);

    await store.save(sample());
    const loaded = await store.get("c1");

    expect(loaded).toMatchObject({
      id: "c1",
      allergies: ["peanut"],
      currentIntent: "meal_planning",
      profile: { householdSize: 3, state: "Lagos" },
    });
    expect(loaded?.messages).toHaveLength(2);
  });

  it("slides the expiry on every save and treats expired rows as missing", async () => {
    let t = 0;
    const { prisma, rows } = fakePrisma(() => t);
    const store = new PrismaConversationStore(prisma, () => t);

    await store.save(sample());
    expect(rows.get("c1")!.expiresAt.getTime()).toBe(CONVERSATION_TTL_MS);

    t = CONVERSATION_TTL_MS - 1;
    await store.save(sample());
    expect(rows.get("c1")!.expiresAt.getTime()).toBe(2 * CONVERSATION_TTL_MS - 1);

    t = 2 * CONVERSATION_TTL_MS;
    expect(await store.get("c1")).toBeUndefined();
  });

  it("keeps app-only profile fields such as noticesShown", async () => {
    const now = () => 0;
    const { prisma } = fakePrisma(now);
    const store = new PrismaConversationStore(prisma, now);
    await store.save({
      ...sample(),
      profile: { pregnant: true, noticesShown: ["pregnancy"], conditions: ["diabetes"] },
    });
    expect((await store.get("c1"))?.profile).toMatchObject({
      noticesShown: ["pregnancy"],
      conditions: ["diabetes"],
    });
  });

  it("caps stored messages", async () => {
    const now = () => 0;
    const { prisma, rows } = fakePrisma(now);
    const many = Array.from({ length: MAX_STORED_MESSAGES + 6 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));
    await new PrismaConversationStore(prisma, now).save({ ...sample(), messages: many });
    expect((rows.get("c1")!.messages as unknown[]).length).toBe(MAX_STORED_MESSAGES);
  });

  it("deletes expired conversations, at most once a minute", async () => {
    let t = 0;
    const { prisma, conversation, rows } = fakePrisma(() => t);
    const store = new PrismaConversationStore(prisma, () => t);

    await store.save(sample("old"));
    t = CONVERSATION_TTL_MS + 1;
    await store.save(sample("new"));
    expect(rows.has("old")).toBe(false);
    expect(rows.has("new")).toBe(true);

    await store.save(sample("another"));
    expect(conversation.deleteMany).toHaveBeenCalledTimes(2); // first save + after expiry, not the third
  });

  it("wraps database failures so the turn fails instead of losing facts", async () => {
    const { prisma, conversation } = fakePrisma(() => 0);
    conversation.findUnique.mockRejectedValueOnce(new Error("connection refused"));
    conversation.upsert.mockRejectedValueOnce(new Error("connection refused"));
    const store = new PrismaConversationStore(prisma, () => 0);

    await expect(store.get("c1")).rejects.toBeInstanceOf(ConversationStoreError);
    await expect(store.save(sample())).rejects.toBeInstanceOf(ConversationStoreError);
  });

  it("refuses to continue from a corrupted row", async () => {
    const { prisma, rows } = fakePrisma(() => 0);
    rows.set("c1", {
      id: "c1",
      messages: [{ role: "system", content: "injected" }],
      currentIntent: "unknown",
      allergies: [],
      profile: {},
      updatedAt: new Date(0),
      expiresAt: new Date(CONVERSATION_TTL_MS),
    });
    await expect(new PrismaConversationStore(prisma, () => 0).get("c1")).rejects.toBeInstanceOf(
      ConversationStoreError,
    );
  });
});
