import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Contact, WhatsAppRepository } from "./service";
import type { StatusUpdate } from "./webhook";

/** Later statuses never move a message back (Meta can deliver them out of order). */
const RANK: Record<string, number> = { received: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export class PrismaWhatsAppRepository implements WhatsAppRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordInbound(waIdHash: string, messageId: string): Promise<Contact | null> {
    const existing = await this.prisma.whatsAppContact.findUnique({ where: { waIdHash } });
    const contact =
      existing ??
      (await this.prisma.whatsAppContact.upsert({
        where: { waIdHash },
        create: { waIdHash },
        update: {},
      }));
    try {
      await this.prisma.whatsAppMessage.create({
        data: { id: messageId, contactId: contact.id, direction: "inbound", status: "received" },
      });
    } catch (error) {
      // The message ID is the primary key: a duplicate means Meta retried it.
      if ((error as { code?: string }).code === "P2002") return null;
      throw error;
    }
    await this.prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: { lastInboundAt: new Date() },
    });
    return {
      id: contact.id,
      consent: contact.consent,
      conversationId: contact.conversationId,
      isNew: !existing,
    };
  }

  async setConsent(contactId: string, consent: "opted_in" | "opted_out"): Promise<void> {
    await this.prisma.whatsAppContact.update({
      where: { id: contactId },
      data: { consent, optedOutAt: consent === "opted_out" ? new Date() : null },
    });
  }

  async setConversation(contactId: string, conversationId: string): Promise<void> {
    await this.prisma.whatsAppContact.update({
      where: { id: contactId },
      data: { conversationId },
    });
  }

  async recordOutbound(contactId: string, messageId: string): Promise<void> {
    await this.prisma.whatsAppMessage.upsert({
      where: { id: messageId },
      create: { id: messageId, contactId, direction: "outbound", status: "sent" },
      update: {},
    });
  }

  async updateStatus(update: StatusUpdate): Promise<void> {
    const message = await this.prisma.whatsAppMessage.findUnique({ where: { id: update.id } });
    if (!message) return; // Not one of ours, or already deleted.
    if ((RANK[update.status] ?? 0) <= (RANK[message.status] ?? 0)) return;
    await this.prisma.whatsAppMessage.update({
      where: { id: update.id },
      data: { status: update.status, errorCode: update.errorCode },
    });
  }
}
