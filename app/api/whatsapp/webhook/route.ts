import { after } from "next/server";
import { getPrisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { chatDeps, chatTurnDeps } from "@/lib/http/chat-deps";
import { RateLimitUnavailableError } from "@/lib/http/rate-limit";
import { CloudApiClient } from "@/lib/whatsapp/client";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { PrismaWhatsAppRepository } from "@/lib/whatsapp/prisma-repository";
import { handleIncoming, handleStatuses, type WhatsAppDeps } from "@/lib/whatsapp/service";
import { validSignature } from "@/lib/whatsapp/signature";
import { parseWebhook } from "@/lib/whatsapp/webhook";

/**
 * The WhatsApp Cloud API webhook (ADR-087). Register
 * <APP_URL>/api/whatsapp/webhook in the Meta app with WHATSAPP_VERIFY_TOKEN
 * and subscribe to the "messages" field. Answers 404 until the WhatsApp
 * settings are configured.
 */

/** Replies are generated after Meta gets its 200, within the same function run. */
export const maxDuration = 60;

/** Meta's webhook payloads are small; anything bigger is not from Meta. */
const MAX_BODY_BYTES = 1_000_000;

/** Meta's verification handshake when the webhook URL is registered. */
export async function GET(request: Request): Promise<Response> {
  const config = getWhatsAppConfig();
  if (!config) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === config.verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const config = getWhatsAppConfig();
  if (!config) return new Response("Not found", { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response("Too large", { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response("Too large", { status: 413 });
  // The signature is checked on the raw bytes before anything is parsed.
  const signature = request.headers.get("x-hub-signature-256");
  if (!validSignature(raw, signature, config.appSecret)) {
    // "missing": not from Meta (or a proxy dropped the header).
    // "mismatch": from Meta, but WHATSAPP_APP_SECRET is not this app's secret.
    console.warn(
      JSON.stringify({
        event: "whatsapp_bad_signature",
        reason: signature ? "mismatch" : "missing",
      }),
    );
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { messages, statuses } = parseWebhook(body);

  const repo = new PrismaWhatsAppRepository(getPrisma());
  const deps: WhatsAppDeps = {
    repo,
    sender: new CloudApiClient(config),
    hashSecret: config.hashSecret,
    chat: chatTurnDeps,
    privacyUrl: `${appUrl()}/privacy`,
    allow: async (contactId) => {
      try {
        return (await chatDeps.rateLimiter.check(`whatsapp:${contactId}`)).allowed;
      } catch (error) {
        // As on the website: a limiter outage lets messages through (ADR-040).
        if (error instanceof RateLimitUnavailableError) return true;
        throw error;
      }
    },
  };

  // Meta expects a quick 200 and retries otherwise, so replies are sent after
  // responding. Each message is handled on its own: one failure does not
  // drop the others, and duplicates from retries are skipped by message ID.
  after(async () => {
    try {
      await handleStatuses(statuses, repo);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "whatsapp_status_failed",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
    for (const message of messages) {
      try {
        await handleIncoming(message, deps);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "whatsapp_message_failed",
            error: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }
  });
  return new Response("OK", { status: 200 });
}
