import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { DEMO_SIGN_VIDEOS } from "@/lib/sign/demo-videos";
import { DEMO_NOTICE } from "@/lib/sign/types";
import { SpeechError, type SpeechToText, type TextToSpeech } from "@/lib/speech";
import {
  CloudApiClient,
  WhatsAppMediaError,
  type OutgoingMessage,
  type WhatsAppSender,
} from "@/lib/whatsapp/client";
import {
  COMMAND_MENU,
  ICE_BREAKERS,
  parseCommand,
  PROFILE_ABOUT,
  PROFILE_DESCRIPTION,
} from "@/lib/whatsapp/commands";
import { whatsappDemoVideos } from "@/lib/whatsapp/demo-videos";
import { checkMedia, MAX_MEDIA_BYTES } from "@/lib/whatsapp/media";
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
import { parseWebhook, type IncomingMessage, type StatusUpdate } from "@/lib/whatsapp/webhook";

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

  it("trims stray spaces and line breaks from pasted settings", () => {
    const config = getWhatsAppConfig({ ...ENV, WHATSAPP_APP_SECRET: " app-secret\n" })!;
    expect(config.appSecret).toBe("app-secret");
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
                  {
                    from: "2348012345678",
                    id: "wamid.3",
                    type: "audio",
                    audio: { id: "media.3", mime_type: "audio/ogg; codecs=opus", voice: true },
                  },
                  {
                    from: "2348012345678",
                    id: "wamid.4",
                    type: "video",
                    video: { id: "media.4", mime_type: "video/mp4", caption: " What is this? " },
                  },
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
      {
        from: "2348012345678",
        id: "wamid.3",
        text: null,
        media: { kind: "audio", id: "media.3", mimeType: "audio/ogg; codecs=opus" },
      },
      {
        from: "2348012345678",
        id: "wamid.4",
        text: "What is this?",
        media: { kind: "video", id: "media.4", mimeType: "video/mp4" },
      },
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
    const created: Contact & { hash: string } = {
      id: `c${this.contacts.size + 1}`,
      hash,
      consent: "opted_in",
      conversationId: null,
      isNew: true,
      voiceReplies: "auto",
      signVideos: false,
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
  resets: { contactId: string; kept: string }[] = [];
  async setPreferences(id: string, prefs: Partial<Pick<Contact, "voiceReplies" | "signVideos">>) {
    Object.assign(this.contacts.get(id)!, prefs);
  }
  async reset(contactId: string, keepMessageId: string) {
    this.resets.push({ contactId, kept: keepMessageId });
    this.contacts.get(contactId)!.conversationId = null;
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
    downloadMedia: async (_id, kind) => ({
      data: new Uint8Array([1, 2, 3]),
      mimeType: kind === "audio" ? "audio/ogg; codecs=opus" : "video/mp4",
    }),
    uploadMedia: async () => "media-1",
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
  const receive = (text: string | null, media?: IncomingMessage["media"]) =>
    handleIncoming({ from: "2348012345678", id: `wamid.in${++n}`, text, media }, deps);
  const texts = () =>
    sent.map((s) =>
      s.message.type === "text"
        ? s.message.body
        : s.message.type === "audio"
          ? `[audio ${s.message.id}]`
          : s.message.caption,
    );
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

  it("asks for text when a picture arrives, and slows down fast senders", async () => {
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

describe("WhatsApp commands, voice notes and the sign-language demo (ADR-090)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const stt = (result: string | Error): SpeechToText => ({
    name: "fake",
    transcribe: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  });
  const tts: TextToSpeech = {
    name: "fake",
    synthesize: async () => ({ data: new Uint8Array([9]), mimeType: "audio/mpeg" }),
  };
  const video = {
    video: DEMO_SIGN_VIDEOS[0]!,
    publicId: "nutraboom/whatsapp/sign-demo-1",
    url: "https://res.cloudinary.com/demo/video/upload/x/nutraboom/whatsapp/sign-demo-1.mp4",
    caption: "Demo mode caption",
  };

  it("recognises commands with or without a slash, only as the whole message", () => {
    expect(parseCommand("SIGN ON")).toBe("opt_in");
    expect(parseCommand("/sign_on")).toBe("opt_in");
    expect(parseCommand("sign off.")).toBe("opt_out");
    expect(parseCommand("STOP")).toBe("opt_out");
    expect(parseCommand(" reset ")).toBe("reset");
    expect(parseCommand("/voice_on")).toBe("voice_on");
    expect(parseCommand("Video off!")).toBe("video_off");
    expect(parseCommand("help")).toBe("help");
    expect(parseCommand("stop giving me rice")).toBeNull();
    expect(parseCommand("reset my meal plan please")).toBeNull();
    expect(parseCommand(null)).toBeNull();
  });

  it("keeps the command menu and ice breakers within WhatsApp's limits", () => {
    expect(COMMAND_MENU.length).toBeLessThanOrEqual(30);
    for (const c of COMMAND_MENU) {
      expect(c.command_name.length).toBeLessThanOrEqual(32);
      expect(c.command_description.length).toBeLessThanOrEqual(256);
      expect(parseCommand(`/${c.command_name}`)).not.toBeNull();
    }
    expect(PROFILE_ABOUT.length).toBeLessThanOrEqual(139);
    expect(PROFILE_DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(ICE_BREAKERS.length).toBeLessThanOrEqual(4);
    for (const p of ICE_BREAKERS) expect(p.length).toBeLessThanOrEqual(80);
  });

  it("SIGN OFF stops everything until SIGN ON, and confirms both", async () => {
    const t = setup();
    await t.receive("Hello");
    await t.receive("SIGN OFF");
    expect(t.texts().at(-1)).toBe(MESSAGES.stopped);
    const before = t.sent.length;
    await t.receive("RESET");
    await t.receive("What about beans?");
    expect(t.sent.length).toBe(before);
    expect(t.repo.resets).toEqual([]);
    await t.receive("sign on");
    expect(t.texts().at(-1)).toBe(MESSAGES.started);
    await t.receive("SIGN ON");
    expect(t.texts().at(-1)).toBe(MESSAGES.alreadyOn);
  });

  it("HELP lists the commands, and RESET forgets only this person's conversation", async () => {
    const t = setup();
    await t.receive("My son is allergic to peanuts");
    const contact = [...t.repo.contacts.values()][0]!;
    expect(contact.conversationId).toBeTruthy();
    await t.receive("help");
    expect(t.texts().at(-1)).toBe(MESSAGES.help);
    expect(MESSAGES.help).toMatch(/RESET[\s\S]*VOICE ON[\s\S]*VIDEO ON[\s\S]*SIGN OFF/);
    await t.receive("/reset");
    expect(t.texts().at(-1)).toBe(MESSAGES.reset);
    expect(t.repo.resets).toEqual([{ contactId: contact.id, kept: "wamid.in3" }]);
    expect(contact.conversationId).toBeNull();
    // The next question starts a new conversation without the old facts.
    await t.receive("What can I cook?");
    expect(t.prompts.at(-1)).not.toContain("allergic to peanuts");
  });

  it("transcribes a voice note, shows what it heard, answers, and replies by voice", async () => {
    const t = setup();
    t.deps.speechToText = async () => stt("What's in an orange?");
    t.deps.textToSpeech = async () => tts;
    await t.receive(null, { kind: "audio", id: "media.1", mimeType: "audio/ogg; codecs=opus" });
    expect(t.texts().slice(1)).toEqual([
      MESSAGES.heard("What's in an orange?"),
      "Oranges are rich in vitamin C.",
      "[audio media-1]",
    ]);
    expect(t.prompts.at(-1)).toContain("What's in an orange?");
    // A typed question gets text only, unless VOICE ON.
    await t.receive("And bananas?");
    expect(t.texts().at(-1)).toBe("Oranges are rich in vitamin C.");
    await t.receive("VOICE ON");
    expect(t.texts().at(-1)).toBe(MESSAGES.voiceOn);
    await t.receive("And mangoes?");
    expect(t.texts().at(-1)).toBe("[audio media-1]");
    await t.receive("voice off");
    await t.receive(null, { kind: "audio", id: "media.2", mimeType: "audio/ogg" });
    expect(t.texts().at(-1)).toBe("Oranges are rich in vitamin C.");
  });

  it("explains when a recording can't be used, and still answers if spoken replies fail", async () => {
    const t = setup();
    await t.receive(null, { kind: "audio", id: "m", mimeType: "audio/ogg" });
    expect(t.texts().at(-1)).toBe(MESSAGES.cantListen);

    t.deps.speechToText = async () => stt(new SpeechError("silence", "empty"));
    await t.receive(null, { kind: "audio", id: "m", mimeType: "audio/ogg" });
    expect(t.texts().at(-1)).toBe(MESSAGES.noSpeech);

    t.deps.speechToText = async () => stt(new SpeechError("down", "provider", 503));
    await t.receive(null, { kind: "audio", id: "m", mimeType: "audio/ogg" });
    expect(t.texts().at(-1)).toBe(MESSAGES.listenFailed);

    t.deps.sender.downloadMedia = async () => {
      throw new WhatsAppMediaError("size");
    };
    t.deps.speechToText = async () => stt("hi");
    await t.receive(null, { kind: "video", id: "m", mimeType: "video/mp4" });
    expect(t.texts().at(-1)).toBe(MESSAGES.mediaTooBig);
    // A video's caption is still answered when its sound can't be used.
    await t.receive("What is this dish?", { kind: "video", id: "m", mimeType: "video/mp4" });
    expect(t.texts().at(-1)).toBe("Oranges are rich in vitamin C.");
    expect(t.prompts).toHaveLength(1);

    t.deps.sender.downloadMedia = async () => ({
      data: new Uint8Array([1]),
      mimeType: "audio/ogg",
    });
    t.deps.textToSpeech = async () => ({
      name: "broken",
      synthesize: async () => {
        throw new SpeechError("down", "provider");
      },
    });
    await t.receive(null, { kind: "audio", id: "m", mimeType: "audio/ogg" });
    expect(t.texts().at(-1)).toBe("Oranges are rich in vitamin C.");
  });

  it("VOICE ON says so when no text-to-speech provider is set up", async () => {
    const t = setup();
    await t.receive("voice on");
    expect(t.texts().at(-1)).toBe(MESSAGES.voiceUnavailable);
    expect([...t.repo.contacts.values()][0]!.voiceReplies).toBe("auto");
  });

  it("VIDEO ON sends a demo video now and after each reply, with the demo notice; VIDEO OFF stops", async () => {
    const t = setup();
    await t.receive("video on");
    expect(t.texts().at(-1)).toBe(MESSAGES.videoUnavailable);

    t.deps.demoVideos = () => [video];
    await t.receive("VIDEO ON");
    expect(t.sent.at(-1)!.message).toEqual({
      type: "video",
      link: video.url,
      caption: video.caption,
    });
    expect(t.texts().at(-2)).toBe(MESSAGES.videoOn);
    await t.receive("Tell me about yam");
    expect(t.texts().slice(-2)).toEqual(["Oranges are rich in vitamin C.", "Demo mode caption"]);
    await t.receive("video off");
    await t.receive("And rice?");
    expect(t.sent.at(-1)!.message.type).toBe("text");
  });
});

describe("WhatsApp media (ADR-090)", () => {
  it("accepts only WhatsApp's audio and video types, up to 16 MB", () => {
    expect(checkMedia("audio", "audio/ogg; codecs=opus", 30_000)).toEqual({ ok: true });
    expect(checkMedia("audio", "audio/mpeg", MAX_MEDIA_BYTES)).toEqual({ ok: true });
    expect(checkMedia("audio", "audio/wav", 100)).toEqual({ ok: false, reason: "type" });
    expect(checkMedia("video", "video/mp4", MAX_MEDIA_BYTES + 1)).toEqual({
      ok: false,
      reason: "size",
    });
    expect(checkMedia("video", "video/webm", 100)).toEqual({ ok: false, reason: "type" });
  });

  it("downloads media in two steps with the token, only from Meta's host", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).startsWith("https://graph.facebook.com/")) {
        return Response.json({
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
          mime_type: "audio/ogg; codecs=opus",
          file_size: 3,
        });
      }
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const client = new CloudApiClient(getWhatsAppConfig(ENV)!, fetchMock);
    const audio = await client.downloadMedia("media.1", "audio");
    expect(audio).toEqual({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg; codecs=opus" });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://graph.facebook.com/v25.0/media.1?phone_number_id=1234567890",
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    }

    const elsewhere = new CloudApiClient(
      getWhatsAppConfig(ENV)!,
      vi.fn<typeof fetch>(async () =>
        Response.json({ url: "https://attacker.example/x", mime_type: "audio/ogg", file_size: 3 }),
      ),
    );
    await expect(elsewhere.downloadMedia("m", "audio")).rejects.toMatchObject({
      reason: "download",
    });

    const tooBig = new CloudApiClient(
      getWhatsAppConfig(ENV)!,
      vi.fn<typeof fetch>(async () =>
        Response.json({
          url: "https://lookaside.fbsbx.com/x",
          mime_type: "video/mp4",
          file_size: MAX_MEDIA_BYTES + 1,
        }),
      ),
    );
    await expect(tooBig.downloadMedia("m", "video")).rejects.toMatchObject({ reason: "size" });
  });

  it("uploads a recording and sends audio and video messages", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/media")
        ? Response.json({ id: "media-9" })
        : Response.json({ messages: [{ id: "wamid.out" }] }),
    );
    const client = new CloudApiClient(getWhatsAppConfig(ENV)!, fetchMock);
    expect(await client.uploadMedia({ data: new Uint8Array([1]), mimeType: "audio/mpeg" })).toBe(
      "media-9",
    );
    const form = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("audio/mpeg");
    await client.send("1", { type: "audio", id: "media-9" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toMatchObject({
      type: "audio",
      audio: { id: "media-9" },
    });
    await client.send("1", {
      type: "video",
      link: "https://res.cloudinary.com/x.mp4",
      caption: "c",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]!.body))).toMatchObject({
      type: "video",
      video: { link: "https://res.cloudinary.com/x.mp4", caption: "c" },
    });
  });

  it("uses exactly two Nigerian Sign Language demo videos from Cloudinary, as MP4", () => {
    expect(whatsappDemoVideos({})).toEqual([]);
    const videos = whatsappDemoVideos({ CLOUDINARY_CLOUD_NAME: "demo-cloud" });
    expect(videos).toHaveLength(2);
    for (const v of videos) {
      expect(v.url).toMatch(
        /^https:\/\/res\.cloudinary\.com\/demo-cloud\/video\/upload\/.*vc_h264:baseline.*ac_aac.*\/nutraboom\/whatsapp\/sign-demo-[12]\.mp4$/,
      );
      expect(v.video.language).toBe("Nigerian Sign Language");
      expect(v.caption).toContain(DEMO_NOTICE);
      expect(v.caption).toContain(v.video.attribution.license);
      expect(v.caption.length).toBeLessThanOrEqual(1024);
    }
  });
});
