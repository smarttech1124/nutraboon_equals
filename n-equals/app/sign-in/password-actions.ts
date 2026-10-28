"use server";

import type { AccountFormState } from "@/app/(account)/actions";
import { allowAttempt, getAuthService } from "@/lib/auth/next";
import { recordAudit } from "@/lib/audit";
import { adminAppUrl, appUrl, getEmailSender } from "@/lib/email";
import { resetPasswordMessage } from "@/lib/email/templates";

/**
 * "Forgot your password?" for administrators (ADR-091). The reply is the
 * same whether or not the email belongs to an administrator, and only
 * administrator accounts are sent a link. Messages never include a token.
 */

const TOO_MANY: AccountFormState = {
  status: "error",
  message: "Too many attempts. Wait a while and try again.",
};
const FAILED: AccountFormState = {
  status: "error",
  message: "Something went wrong. Please try again in a moment.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 300) : "";
}

function logError(action: string, error: unknown) {
  console.error(
    JSON.stringify({
      event: "admin_action_error",
      action,
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
}

export async function forgotAdminPasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("reset", "admin"))) return TOO_MANY;
  const sender = getEmailSender();
  if (!sender.available) {
    return {
      status: "error",
      message: "Password reset by email is not available. Ask a super administrator for help.",
    };
  }
  try {
    const request = await getAuthService().requestAdminPasswordReset(field(formData, "email"));
    if (request) {
      await sender.send({
        to: request.email,
        ...resetPasswordMessage(request.token, appUrl(), adminAppUrl()),
      });
    }
  } catch (error) {
    logError("admin_forgot_password", error);
    return FAILED;
  }
  return {
    status: "success",
    message: "If that email belongs to an administrator, a reset link is on its way.",
  };
}

export async function resetAdminPasswordWithLinkAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  if (!(await allowAttempt("reset", "admin"))) return TOO_MANY;
  try {
    const result = await getAuthService().resetPassword(
      field(formData, "token"),
      String(formData.get("password") ?? ""),
    );
    if (!result.ok) return { status: "error", message: result.error };
    await recordAudit({
      actorUserId: result.userId,
      action: "admin_password.reset_by_link",
      targetType: "user",
      targetId: result.userId,
    });
  } catch (error) {
    logError("admin_reset_password", error);
    return FAILED;
  }
  return { status: "success", message: "Password changed. Sign in with your new password." };
}
