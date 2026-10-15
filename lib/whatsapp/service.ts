import { handleChat, type HandleChatDeps } from "@/lib/conversation/orchestrator";
import type { ChatResponse } from "@/lib/conversation/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/validation/limits";
import type { OutgoingMessage, WhatsAppSender } from "./client";
import { formatReply } from "./format";
import { hashWaId } from "./signature";
import type { IncomingMessage, StatusUpdate } from "./webhook";

/**
 * WhatsApp conversations (ADR-087). People write first, so every reply is
 * inside WhatsApp's 24-hour customer-service window and needs no template.
 * Text messages go through the same chat pipeline as the website, with the
 * same safety checks. STOP ends messages and START resumes them. Only IDs,
 * statuses and a hash of the phone number are stored.
 */

export type Contact = {
  id: string;
  consent: "opted_in" | "opted_out";
  conversationId: string | null;
  isNew: boolean;
};

export interface WhatsAppRepository {
  /** Finds or creates the contact and records this inbound message; null if already seen (a retry). */
  recordInbound(waIdHash: string, messageId: string): Promise<Contact | null>;
  setConsent(contactId: string, consent: "opted_in" | "opted_out"): Promise<void>;
  setConversation(contactId: string, conversationId: string): Promise<void>;
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
};

const STOP = /^\s*(stop|unsubscribe|opt[ -]?out|cancel)\s*[.!]?\s*$/i;
const START = /^\s*(start|subscribe|opt[ -]?in|resume)\s*[.!]?\s*$/i;

export const MESSAGES = {
  welcome: (privacyUrl: string) =>
    `Hello! I'm Equals, the Nutraboom Equals nutrition assistant. Ask me about a food, a meal plan for your household, or what you can cook on your budget.\n\nGeneral nutrition help, not medical advice. In an emergency, call 112. Your messages are processed by our AI provider to answer you, and we don't keep your phone number. Privacy: ${privacyUrl}\n\nReply STOP at any time to stop messages.`,
  stopped:
    "You won't get any more messages from Nutraboom Equals. Reply START if you'd like to chat again.",
  started: "Welcome back! What would you like to ask?",
  textOnly: "I can only read text messages here for now. Please type your question, and I'll help.",
  tooFast: "You're sending messages a little fast. Please wait a moment and try again.",
  unavailable: "I'm having trouble connecting right now. Please try again in a moment.",
};

function log(event: string, detail: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: `whatsapp_${event}`, ...detail }));
}

async function deliver(
  deps: WhatsAppDeps,
  contactId: string,
  to: string,
  messages: OutgoingMessage[],
): Promise<void> {
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
      // A failed picture should not stop the rest; a failed text has nothing after it.
      if (message.type === "text") return;
    }
  }
}

const text = (body: string): OutgoingMessage => ({ type: "text", body });

export async function handleIncoming(message: IncomingMessage, deps: WhatsAppDeps): Promise<void> {
  const contact = await deps.repo.recordInbound(
    hashWaId(message.from, deps.hashSecret),
    message.id,
  );
  if (!contact) return; // Meta retried a message already handled.
  void deps.sender.markRead(message.id).catch(() => {});

  const said = message.text?.trim() ?? "";
  if (STOP.test(said)) {
    await deps.repo.setConsent(contact.id, "opted_out");
    log("opted_out");
    return deliver(deps, contact.id, message.from, [text(MESSAGES.stopped)]);
  }
  if (contact.consent === "opted_out") {
    if (!START.test(said)) return; // Nothing is sent until they say START.
    await deps.repo.setConsent(contact.id, "opted_in");
    log("opted_in");
    return deliver(deps, contact.id, message.from, [text(MESSAGES.started)]);
  }
  if (contact.isNew) {
    await deliver(deps, contact.id, message.from, [text(MESSAGES.welcome(deps.privacyUrl))]);
  }
  if (START.test(said)) return;
  if (!said) return deliver(deps, contact.id, message.from, [text(MESSAGES.textOnly)]);
  if (!(await deps.allow(contact.id))) {
    log("rate_limited");
    return deliver(deps, contact.id, message.from, [text(MESSAGES.tooFast)]);
  }

  const started = Date.now();
  let reply: ChatResponse;
  try {
    reply = await handleChat(
      {
        message: said.slice(0, MAX_MESSAGE_LENGTH),
        conversationId: contact.conversationId ?? undefined,
      },
      await deps.chat(),
    );
  } catch (error) {
    log("chat_failed", { error: error instanceof Error ? error.name : "unknown" });
    return deliver(deps, contact.id, message.from, [text(MESSAGES.unavailable)]);
  }
  if (reply.conversationId !== contact.conversationId) {
    await deps.repo.setConversation(contact.id, reply.conversationId);
  }
  log("replied", { intent: reply.intent, latencyMs: Date.now() - started });
  await deliver(deps, contact.id, message.from, formatReply(reply));
}

export async function handleStatuses(statuses: StatusUpdate[], repo: WhatsAppRepository) {
  for (const s of statuses) {
    await repo.updateStatus(s);
    if (s.status === "failed") log("delivery_failed", { code: s.errorCode });
  }
}
