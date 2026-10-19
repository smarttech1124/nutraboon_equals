import { z } from "zod";

/**
 * The parts of a WhatsApp webhook (ADR-087) this app uses: incoming messages
 * and delivery statuses. Anything else in the payload is ignored.
 */

const message = z.object({
  from: z.string().regex(/^\d{6,20}$/),
  id: z.string().min(1).max(200),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string().min(1).max(200), mime_type: z.string().max(100) }).optional(),
  video: z
    .object({
      id: z.string().min(1).max(200),
      mime_type: z.string().max(100),
      caption: z.string().max(1024).optional(),
    })
    .optional(),
});

const status = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(["sent", "delivered", "read", "failed"]).catch("sent"),
  errors: z.array(z.object({ code: z.number().optional() })).optional(),
});

const payload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messages: z.array(message).optional(),
            statuses: z.array(status).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type IncomingMessage = {
  /** The sender's WhatsApp ID (their number, digits only). Used to reply; never stored. */
  from: string;
  id: string;
  /** The text (or a video's caption), or null for media, locations and other types. */
  text: string | null;
  /** A voice note, audio file or video, to transcribe (ADR-090). Downloaded only when needed. */
  media?: { kind: "audio" | "video"; id: string; mimeType: string };
};

export type StatusUpdate = { id: string; status: string; errorCode: number | null };

export function parseWebhook(body: unknown): {
  messages: IncomingMessage[];
  statuses: StatusUpdate[];
} {
  const parsed = payload.safeParse(body);
  if (!parsed.success) return { messages: [], statuses: [] };
  const values = parsed.data.entry
    .flatMap((e) => e.changes)
    .filter((c) => c.field === "messages")
    .map((c) => c.value);
  return {
    messages: values.flatMap((v) =>
      (v.messages ?? []).map((m): IncomingMessage => {
        const base = { from: m.from, id: m.id };
        if (m.type === "audio" && m.audio) {
          return {
            ...base,
            text: null,
            media: { kind: "audio", id: m.audio.id, mimeType: m.audio.mime_type },
          };
        }
        if (m.type === "video" && m.video) {
          return {
            ...base,
            text: m.video.caption?.trim() || null,
            media: { kind: "video", id: m.video.id, mimeType: m.video.mime_type },
          };
        }
        return { ...base, text: m.type === "text" && m.text ? m.text.body : null };
      }),
    ),
    statuses: values.flatMap((v) =>
      (v.statuses ?? []).map((s) => ({
        id: s.id,
        status: s.status,
        errorCode: s.errors?.[0]?.code ?? null,
      })),
    ),
  };
}
