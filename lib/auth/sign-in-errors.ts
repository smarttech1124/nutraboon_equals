/** Messages for /sign-in?error=… after "Continue with Google" (ADR-071). Unknown codes show nothing. */
export const SIGN_IN_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled. You can try again or use your email.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified:
    "Your Google account's email address isn't verified. Verify it with Google, or use your email and a password.",
  google_unavailable: "Google sign-in isn't available right now. Please use your email.",
  suspended: "This account is suspended. Contact support.",
  too_many: "Too many attempts. Please wait a few minutes and try again.",
};

export function signInError(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(SIGN_IN_ERRORS, code)
    ? SIGN_IN_ERRORS[code]!
    : null;
}
