import { cookies } from "next/headers";
import { allowAttempt } from "@/lib/auth/next";
import { authorizationUrl, googleConfig, newAttempt } from "@/lib/auth/google";
import { GOOGLE_COOKIE, googleCookieOptions, safeNext } from "@/lib/auth/google-cookie";

/** Starts "Continue with Google" (ADR-071): remembers the attempt, then sends the browser to Google. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") ?? "");
  const config = googleConfig();
  if (!config) return Response.redirect(new URL("/sign-in?error=google_unavailable", url), 303);
  if (!(await allowAttempt("signIn", "web"))) {
    return Response.redirect(new URL("/sign-in?error=too_many", url), 303);
  }
  const attempt = newAttempt(next);
  (await cookies()).set(GOOGLE_COOKIE, JSON.stringify(attempt), googleCookieOptions());
  return Response.redirect(authorizationUrl(config, attempt), 303);
}
