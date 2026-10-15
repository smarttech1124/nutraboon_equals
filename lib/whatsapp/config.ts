/**
 * WhatsApp settings (ADR-087), read from the environment only. The module is
 * off until all four secrets are set; nothing is sent or received without them.
 */
export type WhatsAppConfig = {
  /** System-user access token from Meta Business Settings. */
  accessToken: string;
  /** The WhatsApp phone number ID (not the phone number). */
  phoneNumberId: string;
  /** App secret, for the X-Hub-Signature-256 check on every webhook. */
  appSecret: string;
  /** Any string you choose; Meta sends it back when you register the webhook. */
  verifyToken: string;
  /** Graph API version, e.g. "v25.0". */
  apiVersion: string;
  /** Keys the hash of each phone number; falls back to RATE_LIMIT_SECRET. */
  hashSecret: string;
};

export const DEFAULT_API_VERSION = "v25.0";

export function getWhatsAppConfig(
  env: Record<string, string | undefined> = process.env,
): WhatsAppConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const appSecret = env.WHATSAPP_APP_SECRET;
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN;
  if (!accessToken || !phoneNumberId || !appSecret || !verifyToken) return null;
  const apiVersion = /^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION ?? "")
    ? env.WHATSAPP_API_VERSION!
    : DEFAULT_API_VERSION;
  return {
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    apiVersion,
    hashSecret: env.WHATSAPP_HASH_SECRET || env.RATE_LIMIT_SECRET || appSecret,
  };
}
