"use server";

import { redirect } from "next/navigation";
import {
  allowAttempt,
  currentUser,
  endSession,
  getAuthService,
  startSession,
} from "@/lib/auth/next";
import { getEmailSender } from "@/lib/email";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/email/templates";

/**
 * Account actions for the main site (ADR-061). Messages are fixed text:
 * never a stack, a token or whether some other account exists.
 */

export type AccountFormState = { status: "idle" | "success" | "error"; message: string };

const TOO_MANY: AccountFormState = {
  status: "error",
  message: "Too many attempts from this connection. Please wait and try again.",
};
const FAILED: AccountFormState = {
  status: "error",
  message: "Something went wrong. Please try again in a moment.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Only same-site paths, so a crafted link cannot send people elsewhere after sign-in. */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

async function sendVerification(userId: string, email: string) {
  const sender = getEmailSender();
  if (!sender.available) return;
  const token = await getAuthService().issueEmailVerification(userId);
  await sender.send({ to: email, ...verifyEmailMessage(token) });
}

export async function signUpAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("signUp", "web"))) return TOO_MANY;
  try {
    const auth = getAuthService();
    const created = await auth.signUp({
      email: field(formData, "email"),
      name: field(formData, "name"),
      password: field(formData, "password"),
    });
    if (!created.ok) return { status: "error", message: created.error };
    const session = await auth.signIn({
      email: created.user.email,
      password: field(formData, "password"),
      app: "web",
    });
    if (!session.ok) return FAILED;
    await startSession("web", session.token, session.expiresAt);
    await sendVerification(created.user.id, created.user.email).catch(() => {});
  } catch (error) {
    logError("sign_up", error);
    return FAILED;
  }
  redirect(safeNext(field(formData, "next")));
}

export async function signInAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("signIn", "web"))) return TOO_MANY;
  try {
    const result = await getAuthService().signIn({
      email: field(formData, "email"),
      password: field(formData, "password"),
      app: "web",
    });
    if (!result.ok) return { status: "error", message: result.error };
    await startSession("web", result.token, result.expiresAt);
  } catch (error) {
    logError("sign_in", error);
    return FAILED;
  }
  redirect(safeNext(field(formData, "next")));
}

export async function signOutAction(): Promise<void> {
  await endSession("web");
  redirect("/");
}

export async function forgotPasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("reset", "web"))) return TOO_MANY;
  const sender = getEmailSender();
  if (!sender.available) {
    return {
      status: "error",
      message: "Password reset by email is not available yet. Please contact support.",
    };
  }
  try {
    const email = field(formData, "email");
    const token = await getAuthService().requestPasswordReset(email);
    if (token) {
      await sender.send({ to: email.trim().toLowerCase(), ...resetPasswordMessage(token) });
    }
  } catch (error) {
    logError("forgot_password", error);
    return FAILED;
  }
  // The same message whether or not the account exists.
  return {
    status: "success",
    message: "If there is an account for that email, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("reset", "web"))) return TOO_MANY;
  try {
    const result = await getAuthService().resetPassword(
      field(formData, "token"),
      field(formData, "password"),
    );
    if (!result.ok) return { status: "error", message: result.error };
  } catch (error) {
    logError("reset_password", error);
    return FAILED;
  }
  return { status: "success", message: "Password changed. Sign in with your new password." };
}

export async function verifyEmailAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  try {
    const ok = await getAuthService().verifyEmail(field(formData, "token"));
    return ok
      ? { status: "success", message: "Email confirmed. Thank you." }
      : { status: "error", message: "This link has expired or was already used." };
  } catch (error) {
    logError("verify_email", error);
    return FAILED;
  }
}

export async function resendVerificationAction(): Promise<AccountFormState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  if (!getEmailSender().available) {
    return { status: "error", message: "Email is not available yet. Please try again later." };
  }
  try {
    await sendVerification(user.id, user.email);
  } catch (error) {
    logError("resend_verification", error);
    return FAILED;
  }
  return { status: "success", message: "We sent a new confirmation link." };
}

/** Error names only: messages could include what the user typed. */
function logError(action: string, error: unknown) {
  console.error(
    JSON.stringify({
      event: "account_error",
      action,
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
}
