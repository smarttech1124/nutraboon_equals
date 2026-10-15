import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook POST with HMAC-SHA256 of the raw body, keyed with
 * the app secret, in "X-Hub-Signature-256: sha256=<hex>". Checked on the raw
 * bytes before parsing, in constant time.
 */
export function validSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A stable, non-reversible key for a phone number (the number itself is never stored). */
export function hashWaId(waId: string, secret: string): string {
  return createHmac("sha256", secret).update(`whatsapp:${waId}`).digest("hex");
}
