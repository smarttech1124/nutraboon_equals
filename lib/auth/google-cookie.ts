import type { GoogleAttempt } from "./google";

/** The short-lived cookie that ties Google's callback to the browser that started it (ADR-071). */
export const GOOGLE_COOKIE = "nbe_google";

export function googleCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the cookie must come back on Google's top-level redirect to us.
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: 10 * 60,
  };
}

export function readAttempt(value: string | undefined): GoogleAttempt | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<GoogleAttempt>;
    return typeof v.state === "string" &&
      typeof v.verifier === "string" &&
      typeof v.nonce === "string" &&
      typeof v.next === "string"
      ? (v as GoogleAttempt)
      : null;
  } catch {
    return null;
  }
}

/** Only same-site paths: never an open redirect. */
export function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/account";
}
