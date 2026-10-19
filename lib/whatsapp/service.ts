import { handleChat, type HandleChatDeps } from "@/lib/conversation/orchestrator";
import type { ChatResponse } from "@/lib/conversation/types";
import { SpeechError, type SpeechToText, type TextToSpeech } from "@/lib/speech";
import { MAX_MESSAGE_LENGTH } from "@/lib/validation/limits";
import { speechForReply } from "@/lib/voice/speech-text";
import { WhatsAppMediaError, type OutgoingMessage, type WhatsAppSender } from "./client";
import { parseCommand, type Command } from "./commands";
import type { WhatsAppDemoVideo } from "./demo-videos";
import { formatReply } from "./format";
import { hashWaId } from "./signature";
import type { IncomingMessage, StatusUpdate } from "./webhook";

/**
 * WhatsApp conversations (ADR-087, ADR-090). People write first, so every
 * reply is inside WhatsApp's 24-hour customer-service window and needs no
 * template. Text and transcribed voice notes go through the same chat
 * pipeline as the website, with the same safety checks.
 *
 * Commands (lib/whatsapp/commands.ts): HELP, SIGN ON / SIGN OFF (also START
 * and STOP), RESET, VOICE ON / VOICE OFF and VIDEO ON / VIDEO OFF. Only IDs,
 * statuses, preferences and a hash of the phone number are stored; audio is
 * transcribed in memory and never kept.
 */

export type VoiceReplies = "auto" | "always" | "never";

export type Contact = {
  id: string;
  consent: "opted_in" | "opted_out";
  conversationId: string | null;
  isNew: boolean;
  voiceReplies: VoiceReplies;
  signVideos: boolean;
};

export interface WhatsAppRepository {
  /** Finds or creates the contact and records this inbound message; null if already seen (a retry). */
  recordInbound(waIdHash: string, messageId: string): Promise<Contact | null>;
  setConsent(contactId: string, consent: "opted_in" | "opted_out"): Promise<void>;
  setConversation(contactId: string, conversationId: string): Promise<void>;
  setPreferences(
    contactId: string,
    preferences: { voiceReplies?: VoiceReplies; signVideos?: boolean },
  ): Promise<void>;
  /**
   * RESET: deletes this contact's conversation (messages and facts) and their
   * message records except `keepMessageId` (the RESET itself, so a retry of it
   * is still recognised). Only ever this contact's rows.
   */
  reset(contactId: string, keepMessageId: string): Promise<void>;
  recordOutbound(contactId: string, messageId: string): Promise<void>;
  updateStatus(update: StatusUpdate): Promise<void>;
}

export type WhatsAppDeps = {
  repo: WhatsAppRepository;
  sender: WhatsAppSender;
  hashSecret: string;
  /** Builds the chat dependencies (provider, data, store) for one turn. */
  chat: () => Promise<HandleChatDeps>;
  /** Per-contact rate limit; true when this message may be answered. */
  allow: (contactId: string) => Promise<boolean>;
  privacyUrl: string;
  /** Speech to text for voice notes and videos; null when no provider has a key. */
  speechToText?: () => Promise<SpeechToText | null>;
  /** Spoken replies; null when off or without a key. */
  textToSpeech?: () => Promise<TextToSpeech | null>;
  /** The two sign-language demo videos (empty when Cloudinary is not set up). */
  demoVideos?: () => WhatsAppDemoVideo[];
  /** For choosing a demo video; tests make it fixed. */
  random?: () => number;
};

const COMMANDS_HELP = [
  "*HELP*: this list",
  "*RESET*: forget this conversation and start again",
  "*VOICE ON* / *VOICE OFF*: voice replies to every message, or none (by default I reply by voice to a voice note)",
  "*VIDEO ON* / *VIDEO OFF*: a sample sign-language video after each reply (a demo, not a translation)",
  "*SIGN OFF*: stop all messages. *SIGN ON*: start again",
].join("\n");

export const MESSAGES = {
  welcome: (privacyUrl: string) =>
    `Hello! I'm Equals, the Nutraboom Equals nutrition assistant. Ask me about a food, a meal plan for your household, or what you can cook on your budget. You can type or send a voice note.\n\nGeneral nutrition help, not medical advice. In an emergency, call 112. Your messages (and voice notes, turned into text) are processed by our AI providers to answer you, and we don't keep your phone number or recordings. Privacy: ${privacyUrl}\n\nReply HELP for commands, or SIGN OFF (or STOP) at any time to stop messages.`,
  help: `Here's what you can send:\n\n${COMMANDS_HELP}\n\nOr just ask about food, meals or your budget.`,
  stopped:
    "You're signed off: you won't get any more messages from Nutraboom Equals. Reply SIGN ON (or START) if you'd like to chat again.",
  started: "You're signed on. Welcome back! What would you like to ask?",
  alreadyOn: "You're already signed on. What would you like to ask? Reply HELP for commands.",
  reset:
    "Done: I've forgotten our conversation, including anything you told me about your household, allergies or budget. What would you like to ask?",
  voiceOn:
    "Voice replies on: each answer will also come as a voice message. Reply VOICE OFF to stop.",
  voiceOff: "Voice replies off: I'll answer in text only. Reply VOICE ON to turn them back on.",
  voiceUnavailable: "Voice replies aren't available right now, so I'll answer in text.",
  videoOn:
    "Sign-language demo on. After each reply I'll send a sample video. It's a demo: it does not translate my reply. Reply VIDEO OFF to stop.",
  videoOff: "Sign-language demo off.",
  videoUnavailable: "The sign-language demo isn't available right now.",
  heard: (text: string) => `I heard: “${text}”`,
  noSpeech:
    "I couldn't hear any words in that recording. Could you try again, or type your question?",
  listenFailed:
    "Sorry, I couldn't understand that recording. Could you try again, or type your question?",
  mediaTooBig:
    "That recording is too long for me. Please send a shorter one (under 16 MB), or type.",
  cantListen: "I can't listen to recordings right now. Please type your question, and I'll help.",
  textOnly:
    "I can read text and listen to voice notes and videos, but not this kind of message. Please type your question, and I'll help.",
  tooFast: "You're sending messages a little fast. Please wait a moment and try again.",
  unavailable: "I'm having trouble connecting right now. Please try again in a moment.",
};

function log(event: string, detail: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: `whatsapp_${event}`, ...detail }));
}

/** Sends in order; returns false if a text failed (nothing after it is sent). */
async function deliver(
  deps: WhatsAppDeps,
  contactId: string,
  to: string,
  messages: OutgoingMessage[],
): Promise<boolean> {
  for (const message of messages) {
    try {
      const id = await deps.sender.send(to, message);
      await deps.repo.recordOutbound(contactId, id);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "whatsapp_send_failed",
          type: message.type,
          status: (error as { status?: number | null }).status ?? null,
          code: (error as { code?: number | null }).code ?? null,
        }),
      );
      // A failed picture, recording or video should not stop the rest; a failed text has nothing after it.
      if (message.type === "text") return false;
    }
  }
  return true;
}

const text = (body: string): OutgoingMessage => ({ type: "text", body });

/** Commands that change settings or state. Returns the confirmation to send. */
async function runCommand(
  command: Exclude<Command, "opt_in" | "opt_out">,
  contact: Contact,
  message: IncomingMessage,
  deps: WhatsAppDeps,
): Promise<OutgoingMessage[]> {
  switch (command) {
    case "help":
      return [text(MESSAGES.help)];
    case "reset":
      await deps.repo.reset(contact.id, message.id);
      log("reset");
      return [text(MESSAGES.reset)];
    case "voice_on": {
      if (!(await deps.textToSpeech?.())) return [text(MESSAGES.voiceUnavailable)];
      await deps.repo.setPreferences(contact.id, { voiceReplies: "always" });
      return [text(MESSAGES.voiceOn)];
    }
    case "voice_off":
      await deps.repo.setPreferences(contact.id, { voiceReplies: "never" });
      return [text(MESSAGES.voiceOff)];
    case "video_on": {
      const videos = deps.demoVideos?.() ?? [];
      if (videos.length === 0) return [text(MESSAGES.videoUnavailable)];
      await deps.repo.setPreferences(contact.id, { signVideos: true });
      return [text(MESSAGES.videoOn), pickVideo(videos, deps)];
    }
    case "video_off":
      await deps.repo.setPreferences(contact.id, { signVideos: false });
      return [text(MESSAGES.videoOff)];
  }
}

function pickVideo(videos: WhatsAppDemoVideo[], deps: WhatsAppDeps): OutgoingMessage {
  const r = (deps.random ?? Math.random)();
  const v = videos[Math.min(videos.length - 1, Math.floor(r * videos.length))];
  return { type: "video", link: v.url, caption: v.caption };
}

/** The words in a voice note or video, or the message to send instead. */
async function transcribe(
  media: NonNullable<IncomingMessage["media"]>,
  deps: WhatsAppDeps,
): Promise<{ ok: true; text: string } | { ok: false; reply: string }> {
  const stt = await deps.speechToText?.().catch(() => null);
  if (!stt) return { ok: false, reply: MESSAGES.cantListen };
  const started = Date.now();
  try {
    const audio = await deps.sender.downloadMedia(media.id, media.kind);
    const words = (await stt.transcribe(audio)).trim();
    log("transcribed", { kind: media.kind, provider: stt.name, latencyMs: Date.now() - started });
    return words ? { ok: true, text: words } : { ok: false, reply: MESSAGES.noSpeech };
  } catch (error) {
    if (error instanceof WhatsAppMediaError) {
      log("media_rejected", { kind: media.kind, reason: error.reason });
      return {
        ok: false,
        reply:
          error.reason === "size"
            ? MESSAGES.mediaTooBig
            : error.reason === "type"
              ? MESSAGES.textOnly
              : MESSAGES.listenFailed,
      };
    }
    if (error instanceof SpeechError && error.category === "empty") {
      return { ok: false, reply: MESSAGES.noSpeech };
    }
    log("transcription_failed", {
      kind: media.kind,
      category: error instanceof SpeechError ? error.category : "unknown",
    });
    return { ok: false, reply: MESSAGES.listenFailed };
  }
}

/** The reply as a voice message: synthesised, uploaded to WhatsApp, never stored by us. */
async function voiceMessage(
  reply: ChatResponse,
  deps: WhatsAppDeps,
): Promise<OutgoingMessage | null> {
  const tts = await deps.textToSpeech?.().catch(() => null);
  if (!tts) return null;
  const m = reply.metadata ?? {};
  const words = speechForReply({
    message: reply.message,
    urgentNotice: m.urgentNotice,
    allergyNotice: m.allergyNotice,
    safetyNotice: m.safetyNotice,
  });
  try {
    const audio = await tts.synthesize(words);
    return { type: "audio", id: await deps.sender.uploadMedia(audio) };
  } catch (error) {
    log("voice_reply_failed", {
      category: error instanceof SpeechError ? error.category : "upload",
    });
    return null;
  }
}

export async function handleIncoming(message: IncomingMessage, deps: WhatsAppDeps): Promise<void> {
  const contact = await deps.repo.recordInbound(
    hashWaId(message.from, deps.hashSecret),
    message.id,
  );
  if (!contact) return; // Meta retried a message already handled.
  void deps.sender.markRead(message.id).catch(() => {});
  const send = (messages: OutgoingMessage[]) => deliver(deps, contact.id, message.from, messages);

  const command = message.media ? null : parseCommand(message.text);
  if (command === "opt_out") {
    await deps.repo.setConsent(contact.id, "opted_out");
    log("opted_out");
    await send([text(MESSAGES.stopped)]);
    return;
  }
  if (contact.consent === "opted_out") {
    if (command !== "opt_in") return; // Nothing is sent until they sign on again.
    await deps.repo.setConsent(contact.id, "opted_in");
    log("opted_in");
    await send([text(MESSAGES.started)]);
    return;
  }
  if (contact.isNew) await send([text(MESSAGES.welcome(deps.privacyUrl))]);
  if (command === "opt_in") {
    if (!contact.isNew) await send([text(MESSAGES.alreadyOn)]);
    return;
  }
  if (command) {
    await send(await runCommand(command, contact, message, deps));
    return;
  }
  if (!message.text?.trim() && !message.media) {
    await send([text(MESSAGES.textOnly)]);
    return;
  }
  if (!(await deps.allow(contact.id))) {
    log("rate_limited");
    await send([text(MESSAGES.tooFast)]);
    return;
  }

  // A voice note or video is turned into words first, shown back so a
  // misheard word can be corrected before it changes the advice.
  let said = message.text?.trim() ?? "";
  let spoken = false;
  if (message.media) {
    const heard = await transcribe(message.media, deps);
    if (!heard.ok) {
      // A video's caption can still be answered when its sound can't.
      if (!said) {
        await send([text(heard.reply)]);
        return;
      }
    } else {
      said = said ? `${said}\n${heard.text}` : heard.text;
      spoken = true;
      await send([text(MESSAGES.heard(heard.text.slice(0, 1000)))]);
    }
  }

  const started = Date.now();
  let reply: ChatResponse;
  try {
    reply = await handleChat(
      {
        message: said.slice(0, MAX_MESSAGE_LENGTH),
        conversationId: contact.conversationId ?? undefined,
        ...(spoken ? { inputMode: "voice" as const } : {}),
      },
      await deps.chat(),
    );
  } catch (error) {
    log("chat_failed", { error: error instanceof Error ? error.name : "unknown" });
    await send([text(MESSAGES.unavailable)]);
    return;
  }
  if (reply.conversationId !== contact.conversationId) {
    await deps.repo.setConversation(contact.id, reply.conversationId);
  }
  log("replied", { intent: reply.intent, latencyMs: Date.now() - started, spoken });
  if (!(await send(formatReply(reply)))) return;

  const extras: OutgoingMessage[] = [];
  const wantsVoice =
    contact.voiceReplies === "always" || (contact.voiceReplies === "auto" && spoken);
  if (wantsVoice) {
    const voice = await voiceMessage(reply, deps);
    if (voice) extras.push(voice);
  }
  if (contact.signVideos) {
    const videos = deps.demoVideos?.() ?? [];
    if (videos.length > 0) extras.push(pickVideo(videos, deps));
  }
  if (extras.length > 0) await send(extras);
}

export async function handleStatuses(statuses: StatusUpdate[], repo: WhatsAppRepository) {
  for (const s of statuses) {
    await repo.updateStatus(s);
    if (s.status === "failed") log("delivery_failed", { code: s.errorCode });
  }
}
