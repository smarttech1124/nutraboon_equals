import { createHash, randomBytes } from "node:crypto";
import type { OAuthProfile } from "./service";

/**
 * "Continue with Google" (ADR-071): the OpenID Connect authorization code
 * flow with PKCE, state and nonce, done by the server. The ID token comes
 * straight from Google's token endpoint over TLS with our client secret, so
 * its issuer, audience, expiry and nonce are checked but not its signature
 * (OpenID Connect Core 1.0, section 3.1.3.7). Google's tokens are never stored.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const TIMEOUT_MS = 10_000;

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Null when Google sign-in is not configured: the button is then hidden. */
export function googleConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const base = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` };
}

/** One sign-in attempt: kept in a short-lived, httpOnly cookie between the two requests. */
export type GoogleAttempt = { state: string; verifier: string; nonce: string; next: string };

export function newAttempt(next: string): GoogleAttempt {
  const r = () => randomBytes(32).toString("base64url");
  return { state: r(), verifier: r(), nonce: r(), next };
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizationUrl(config: GoogleConfig, attempt: GoogleAttempt): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: codeChallenge(attempt.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export type GoogleError = "exchange_failed" | "invalid_token";

function decodePayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Checks the ID token's claims and turns them into a profile, or null. */
export function profileFromIdToken(
  idToken: string,
  config: GoogleConfig,
  nonce: string,
  now: Date = new Date(),
): OAuthProfile | null {
  const c = decodePayload(idToken);
  if (!c) return null;
  const audOk =
    c.aud === config.clientId || (Array.isArray(c.aud) && c.aud.includes(config.clientId));
  const notExpired = typeof c.exp === "number" && c.exp * 1000 > now.getTime();
  if (
    !ISSUERS.has(String(c.iss)) ||
    !audOk ||
    !notExpired ||
    c.nonce !== nonce ||
    typeof c.sub !== "string" ||
    !c.sub ||
    typeof c.email !== "string"
  ) {
    return null;
  }
  return {
    provider: "google",
    accountId: c.sub,
    email: c.email,
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: typeof c.name === "string" ? c.name : "",
  };
}

/** Exchanges the authorization code for an ID token and reads the verified profile. */
export async function exchangeCode(
  code: string,
  attempt: GoogleAttempt,
  config: GoogleConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; profile: OAuthProfile } | { ok: false; error: GoogleError }> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: attempt.verifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "exchange_failed" };
  }
  if (!response.ok) return { ok: false, error: "exchange_failed" };
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (typeof body?.id_token !== "string") return { ok: false, error: "invalid_token" };
  const profile = profileFromIdToken(body.id_token, config, attempt.nonce);
  return profile ? { ok: true, profile } : { ok: false, error: "invalid_token" };
}
