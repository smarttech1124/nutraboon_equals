import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { CloudApiClient, type OutgoingMessage, type WhatsAppSender } from "@/lib/whatsapp/client";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { formatReply } from "@/lib/whatsapp/format";
import {
  handleIncoming,
  handleStatuses,
  MESSAGES,
  type Contact,
  type WhatsAppDeps,
  type WhatsAppRepository,
} from "@/lib/whatsapp/service";
import { hashWaId, validSignature } from "@/lib/whatsapp/signature";
import { parseWebhook, type StatusUpdate } from "@/lib/whatsapp/webhook";

const ENV = {
  WHATSAPP_ACCESS_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-me",
};

describe("WhatsApp configuration and signatures (ADR-087)", () => {
  it("is off until all four settings are present", () => {
    expect(getWhatsAppConfig({})).toBeNull();
    expect(getWhatsAppConfig({ ...ENV, WHATSAPP_APP_SECRET: "" })).toBeNull();
    expect(getWhatsAppConfig(ENV)).toMatchObject({
      apiVersion: "v25.0",
      phoneNumberId: "1234567890",
    });
    expect(getWhatsAppConfig({ ...ENV, WHATSAPP_API_VERSION: "v26.0" })!.apiVersion).toBe("v26.0");
    expect(getWhatsAppConfig({ ...ENV, WHATSAPP_API_VERSION: "latest" })!.apiVersion).toBe("v25.0");
  });

  it("accepts only bodies signed with the app secret", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(validSignature(body, sig, "app-secret")).toBe(true);
    expect(validSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(validSignature(body, sig, "other-secret")).toBe(false);
    expect(validSignature(body, null, "app-secret")).toBe(false);
    expect(validSignature(body, "sha256=abc", "app-secret")).toBe(false);
  });

  it("hashes phone numbers so they are never stored", () => {
    const hash = hashWaId("2348012345678", "secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("2348012345678");
    expect(hashWaId("2348012345678", "secret")).toBe(hash);
  });
});

describe("webhook parsing", () => {
  it("reads text messages, other message types and statuses", () => {
    const parsed = parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: "2348012345678", id: "wamid.1", type: "text", text: { body: "Hi" } },
                  { from: "2348012345678", id: "wamid.2", type: "image" },
                ],
                statuses: [{ id: "wamid.9", status: "failed", errors: [{ code: 131047 }] }],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.messages).toEqual([
      { from: "2348012345678", id: "wamid.1", text: "Hi" },
      { from: "2348012345678", id: "wamid.2", text: null },
    ]);
    expect(parsed.statuses).toEqual([{ id: "wamid.9", status: "failed", errorCode: 131047 }]);
  });

  it("ignores anything that is not a WhatsApp payload", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook("nonsense")).toEqual({ messages: [], statuses: [] });
  });
});

describe("Cloud API client", () => {
  it("sends text to the phone number's messages endpoint and returns the message ID", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ messages: [{ id: "wamid.out" }] }),
    );
    const client = new CloudApiClient(getWhatsAppConfig(ENV)!, fetchMock);
    expect(await client.send("2348012345678", { type: "text", body: "Hello" })).toBe("wamid.out");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init!.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "2348012345678",
      type: "text",
      text: { body: "Hello", preview_url: false },
    });
  });

  it("reports failures by status and Meta's code only", async () => {
    const client = new CloudApiClient(
      getWhatsAppConfig(ENV)!,
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: { code: 131047, message: "Re-engagement…" } }, { status: 400 }),
      ),
    );
    await expect(client.send("1", { type: "text", body: "x" })).rejects.toMatchObject({
      status: 400,
      code: 131047,
    });
  });
});

class MemoryRepo implements WhatsAppRepository {
  contacts = new Map<string, Contact & { hash: string }>();
  seen = new Set<string>();
  outbound: string[] = [];
  statuses: StatusUpdate[] = [];
  async recordInbound(hash: string, id: string) {
    if (this.seen.has(id)) return null;
    this.seen.add(id);
    const existing = [...this.contacts.values()].find((c) => c.hash === hash);
    if (existing) return { ...existing, isNew: false };
    const created = {
      id: `c${this.contacts.size + 1}`,
      hash,
      consent: "opted_in" as const,
      conversationId: null,
      isNew: true,
    };
    this.contacts.set(created.id, created);
    return created;
  }
  async setConsent(id: string, consent: "opted_in" | "opted_out") {
    this.contacts.get(id)!.consent = consent;
  }
  async setConversation(id: string, conversationId: string) {
    this.contacts.get(id)!.conversationId = conversationId;
  }
  async recordOutbound(_contactId: string, id: string) {
    this.outbound.push(id);
  }
  async updateStatus(update: StatusUpdate) {
    this.statuses.push(update);
  }
}

function setup(reply = "Oranges are rich in vitamin C.") {
  const repo = new MemoryRepo();
  const sent: { to: string; message: OutgoingMessage }[] = [];
  const sender: WhatsAppSender = {
    send: async (to, message) => {
      sent.push({ to, message });
      return `wamid.out${sent.length}`;
    },
    markRead: async () => {},
  };
  const prompts: string[] = [];
  const provider: AIProvider = {
    name: "scripted",
    generateResponse: async (req) => {
      // The prompt and the conversation history the provider receives.
      prompts.push([req.systemPrompt, ...req.messages.map((m) => m.content)].join("\n"));
      return { message: reply, intent: "food_information" };
    },
  };
  const store = new InMemoryConversationStore();
  let allowed = true;
  const deps: WhatsAppDeps = {
    repo,
    sender,
    hashSecret: "secret",
    chat: async () => ({ provider, store }),
    allow: async () => allowed,
    privacyUrl: "https://example.test/privacy",
  };
  let n = 0;
  const receive = (text: string | null) =>
    handleIncoming({ from: "2348012345678", id: `wamid.in${++n}`, text }, deps);
  const texts = () =>
    sent.map((s) => (s.message.type === "text" ? s.message.body : s.message.caption));
  return { repo, sent, texts, receive, deps, prompts, block: () => (allowed = false) };
}

describe("WhatsApp conversations", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("welcomes a new person, answers through the chat pipeline and continues the conversation", async () => {
    const t = setup();
    await t.receive("Tell me about oranges");
    expect(t.texts()).toEqual([
      MESSAGES.welcome("https://example.test/privacy"),
      "Oranges are rich in vitamin C.",
    ]);
    expect(t.sent.every((s) => s.to === "2348012345678")).toBe(true);
    const contact = [...t.repo.contacts.values()][0]!;
    expect(contact.conversationId).toBeTruthy();
    expect(contact.hash).not.toContain("2348012345678");

    await t.receive("And bananas?");
    expect(t.texts()).toHaveLength(3); // no second welcome
    expect(contact.conversationId).toBeTruthy();
    expect(t.prompts[1]).toContain("Tell me about oranges");
    expect(t.repo.outbound).toEqual(["wamid.out1", "wamid.out2", "wamid.out3"]);
  });

  it("skips a message Meta delivers twice", async () => {
    const t = setup();
    const message = { from: "2348012345678", id: "wamid.same", text: "Hi" };
    await handleIncoming(message, t.deps);
    await handleIncoming(message, t.deps);
    expect(t.prompts).toHaveLength(1);
  });

  it("stops on STOP, stays silent until START, then resumes", async () => {
    const t = setup();
    await t.receive("Hello");
    await t.receive("STOP");
    expect(t.texts().at(-1)).toBe(MESSAGES.stopped);
    const before = t.sent.length;
    await t.receive("What about beans?");
    expect(t.sent.length).toBe(before);
    await t.receive("start");
    expect(t.texts().at(-1)).toBe(MESSAGES.started);
    await t.receive("What about beans?");
    expect(t.texts().at(-1)).toBe("Oranges are rich in vitamin C.");
  });

  it("asks for text when a picture or voice note arrives, and slows down fast senders", async () => {
    const t = setup();
    await t.receive(null);
    expect(t.texts().at(-1)).toBe(MESSAGES.textOnly);
    t.block();
    await t.receive("Hi again");
    expect(t.texts().at(-1)).toBe(MESSAGES.tooFast);
    expect(t.prompts).toHaveLength(0);
  });

  it("says so when the AI is unavailable", async () => {
    const t = setup();
    t.deps.chat = async () => {
      throw new Error("provider down");
    };
    await t.receive("Hi");
    expect(t.texts().at(-1)).toBe(MESSAGES.unavailable);
  });

  it("records delivery statuses", async () => {
    const t = setup();
    await handleStatuses([{ id: "wamid.out1", status: "read", errorCode: null }], t.repo);
    expect(t.repo.statuses).toEqual([{ id: "wamid.out1", status: "read", errorCode: null }]);
  });
});

describe("reply formatting", () => {
  it("writes out notices, the shopping list and pictures, within WhatsApp's limit", () => {
    const messages = formatReply({
      conversationId: "c",
      message: "Here is a plan.",
      intent: "budget_planning",
      metadata: {
        urgentNotice: "Get care now.",
        safetyNotice: "Ask a professional.",
        budget: {
          budget: 2000,
          region: "national",
          regionLabel: "national average",
          priceSource: "NBS, May 2026",
          priceSourceUrl: "https://example.test",
          fromHome: [],
          purchases: [{ name: "Tomatoes", quantity: "1", unitLabel: "kg", estimatedCost: 900 }],
          unpriced: [],
          estimatedTotal: 900,
          estimatedRemaining: 1100,
        },
        visuals: [
          {
            id: "x",
            title: "A good latch",
            alt: "alt",
            caption: "Chin first.",
            src: "https://upload.wikimedia.org/x.jpg",
            width: 1,
            height: 1,
            credit: { author: "A", license: "CC0", sourceUrl: "https://commons.wikimedia.org/x" },
          },
        ],
      },
    });
    const body = (messages[0] as { body: string }).body;
    expect(body.startsWith("⚠️ Get care now.")).toBe(true);
    expect(body).toContain("Tomatoes (1 kg): about ₦900");
    expect(body).toContain("Estimated left over: ₦1,100");
    expect(body.endsWith("ℹ️ Ask a professional.")).toBe(true);
    expect(messages[1]).toEqual({
      type: "image",
      link: "https://upload.wikimedia.org/x.jpg",
      caption: "A good latch: Chin first.\nPicture: A, CC0, via Wikimedia Commons",
    });
    const long = formatReply({ conversationId: "c", message: "x".repeat(5000), intent: "unknown" });
    expect((long[0] as { body: string }).body.length).toBe(4096);
  });
});
