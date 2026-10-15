import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { exchangeCode, googleConfig } from "@/lib/auth/google";
import { GOOGLE_COOKIE, readAttempt } from "@/lib/auth/google-cookie";
import { getAuthService, startSession } from "@/lib/auth/next";
import { recordAudit } from "@/lib/audit";

/**
 * Google's redirect back after "Continue with Google" (ADR-071). Checks the
 * state against the cookie, exchanges the code (PKCE), signs the person in
 * or creates their account, and continues to where they were going.
 */

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function log(event: string, detail?: string) {
  console.info(JSON.stringify({ event: `google_${event}`, ...(detail ? { detail } : {}) }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string) => Response.redirect(new URL(`/sign-in?error=${code}`, url), 303);
  const jar = await cookies();
  const attempt = readAttempt(jar.get(GOOGLE_COOKIE)?.value);
  jar.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });

  const config = googleConfig();
  if (!config) return fail("google_unavailable");
  // The person closed Google's screen or refused.
  if (url.searchParams.get("error")) return fail("google_cancelled");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!attempt || !code || !sameState(state, attempt.state)) {
    log("state_mismatch");
    return fail("google_failed");
  }

  try {
    const result = await exchangeCode(code, attempt, config);
    if (!result.ok) {
      log("exchange", result.error);
      return fail("google_failed");
    }
    const signIn = await getAuthService().signInWithOAuth(result.profile);
    if (!signIn.ok) {
      log("refused");
      return fail(signIn.error.includes("suspended") ? "suspended" : "google_unverified");
    }
    await startSession("web", signIn.token, signIn.expiresAt);
    await recordAudit({
      actorUserId: signIn.user.id,
      action: signIn.created ? "account.created_google" : "account.signed_in_google",
      targetType: "user",
      targetId: signIn.user.id,
    });
    return Response.redirect(new URL(attempt.next, url), 303);
  } catch (error) {
    log("error", error instanceof Error ? error.name : "unknown");
    return fail("google_failed");
  }
}
