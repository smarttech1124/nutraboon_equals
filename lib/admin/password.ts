import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Admin password hashing with scrypt (ADR-048). Stored as
 * "scrypt:N:r:p:<salt>:<hash>" in base64url. No "$" characters, because
 * Next.js expands "$NAME" inside .env values.
 */

const N = 32_768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
/** scrypt needs about 128 * N * r bytes; allow headroom above Node's 32 MB default. */
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

/** True only for a well-formed hash that matches. Constant-time comparison. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 1_048_576) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < 8 || expected.length < 16) return false;
  try {
    const actual = await derive(password, salt, n, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isPasswordHash(value: string | undefined): boolean {
  return /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(value ?? "");
}
