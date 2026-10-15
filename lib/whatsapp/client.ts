import type { WhatsAppConfig } from "./config";

/** A Cloud API failure, with Meta's status and error code only (bodies can quote the request). */
export class WhatsAppSendError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: number | null,
  ) {
    super(`WhatsApp send failed (${status ?? "network"}${code ? `, code ${code}` : ""})`);
    this.name = "WhatsAppSendError";
  }
}

export type OutgoingMessage =
  { type: "text"; body: string } | { type: "image"; link: string; caption: string };

export interface WhatsAppSender {
  /** Returns Meta's message ID. */
  send(to: string, message: OutgoingMessage): Promise<string>;
  markRead(messageId: string): Promise<void>;
}

/** WhatsApp Cloud API (graph.facebook.com/<version>/<phone number ID>/messages). */
export class CloudApiClient implements WhatsAppSender {
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(payload: Record<string, unknown>): Promise<unknown> {
    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new WhatsAppSendError(null, null);
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: number };
    } | null;
    if (!response.ok) throw new WhatsAppSendError(response.status, body?.error?.code ?? null);
    return body;
  }

  async send(to: string, message: OutgoingMessage): Promise<string> {
    const body = (await this.post({
      recipient_type: "individual",
      to,
      ...(message.type === "text"
        ? { type: "text", text: { body: message.body, preview_url: false } }
        : { type: "image", image: { link: message.link, caption: message.caption } }),
    })) as { messages?: { id?: string }[] } | null;
    const id = body?.messages?.[0]?.id;
    if (!id) throw new WhatsAppSendError(200, null);
    return id;
  }

  async markRead(messageId: string): Promise<void> {
    await this.post({ status: "read", message_id: messageId });
  }
}
