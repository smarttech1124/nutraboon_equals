import type { Audio } from "@/lib/speech/types";
import type { WhatsAppConfig } from "./config";
import { checkMedia, MAX_MEDIA_BYTES } from "./media";

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
  | { type: "text"; body: string }
  | { type: "image"; link: string; caption: string }
  /** A recording uploaded to WhatsApp first (uploadMedia). */
  | { type: "audio"; id: string }
  /** A public MP4 link, which Meta fetches (ADR-090). */
  | { type: "video"; link: string; caption: string };

/** Media that could not be used: wrong type or too big ("type", "size"), or the download failed. */
export class WhatsAppMediaError extends Error {
  constructor(readonly reason: "type" | "size" | "download") {
    super(`WhatsApp media unusable (${reason})`);
    this.name = "WhatsAppMediaError";
  }
}

export interface WhatsAppSender {
  /** Returns Meta's message ID. */
  send(to: string, message: OutgoingMessage): Promise<string>;
  markRead(messageId: string): Promise<void>;
  /** Downloads an incoming voice note or video, checked against WhatsApp's types and 16 MB limit. */
  downloadMedia(mediaId: string, kind: "audio" | "video"): Promise<Audio>;
  /** Uploads a recording for an audio message; returns the media ID. */
  uploadMedia(media: Audio): Promise<string>;
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
    const content =
      message.type === "text"
        ? { type: "text", text: { body: message.body, preview_url: false } }
        : message.type === "image"
          ? { type: "image", image: { link: message.link, caption: message.caption } }
          : message.type === "audio"
            ? { type: "audio", audio: { id: message.id } }
            : { type: "video", video: { link: message.link, caption: message.caption } };
    const body = (await this.post({ recipient_type: "individual", to, ...content })) as {
      messages?: { id?: string }[];
    } | null;
    const id = body?.messages?.[0]?.id;
    if (!id) throw new WhatsAppSendError(200, null);
    return id;
  }

  async markRead(messageId: string): Promise<void> {
    await this.post({ status: "read", message_id: messageId });
  }

  private auth() {
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }

  /**
   * Two steps (Meta's media reference): the media ID gives a URL valid for
   * five minutes, which is downloaded with the same token. The size is
   * checked before and while downloading; the file stays in memory only.
   */
  async downloadMedia(mediaId: string, kind: "audio" | "video"): Promise<Audio> {
    const base = `https://graph.facebook.com/${this.config.apiVersion}`;
    let info: { url?: string; mime_type?: string; file_size?: number } | null;
    try {
      const response = await this.fetchImpl(
        `${base}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(this.config.phoneNumberId)}`,
        { headers: this.auth(), signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) throw new WhatsAppMediaError("download");
      info = (await response.json().catch(() => null)) as typeof info;
    } catch (error) {
      if (error instanceof WhatsAppMediaError) throw error;
      throw new WhatsAppMediaError("download");
    }
    if (!info?.url || !info.mime_type) throw new WhatsAppMediaError("download");
    const declared = checkMedia(kind, info.mime_type, info.file_size ?? 1);
    if (!declared.ok) throw new WhatsAppMediaError(declared.reason);
    // Only Meta's own media host, so a bad response can't send the token elsewhere.
    const url = new URL(info.url);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)(fbsbx|facebook|whatsapp)\.(com|net)$/.test(url.hostname)
    ) {
      throw new WhatsAppMediaError("download");
    }
    let data: Uint8Array;
    try {
      const response = await this.fetchImpl(url, {
        headers: this.auth(),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new WhatsAppMediaError("download");
      if (Number(response.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) {
        throw new WhatsAppMediaError("size");
      }
      data = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof WhatsAppMediaError) throw error;
      throw new WhatsAppMediaError("download");
    }
    const actual = checkMedia(kind, info.mime_type, data.byteLength);
    if (!actual.ok) throw new WhatsAppMediaError(actual.reason);
    return { data, mimeType: info.mime_type };
  }

  async uploadMedia(media: Audio): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", media.mimeType);
    form.append(
      "file",
      new Blob([new Uint8Array(media.data)], { type: media.mimeType }),
      "reply.mp3",
    );
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/media`,
        { method: "POST", headers: this.auth(), body: form, signal: AbortSignal.timeout(30_000) },
      );
    } catch {
      throw new WhatsAppSendError(null, null);
    }
    const body = (await response.json().catch(() => null)) as {
      id?: string;
      error?: { code?: number };
    } | null;
    if (!response.ok || !body?.id) {
      throw new WhatsAppSendError(response.status, body?.error?.code ?? null);
    }
    return body.id;
  }
}
