"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser, getAuthService, startSession } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { isNeed } from "@/lib/hospitals/accessibility";

/** Profile changes from the account dashboard (ADR-075). Each checks the session itself. */

export type ProfileState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  /** What was submitted, so a form keeps the person's input after an error (React resets forms). */
  values?: { name?: string; needs?: string[] };
};

const SIGNED_OUT: ProfileState = { status: "error", message: "Please sign in again." };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const nameSchema = z.string().trim().min(1, "Enter your name.").max(100, "That name is too long.");

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await currentUser("web");
  if (!user) return SIGNED_OUT;
  const needs = [
    ...new Set(
      formData.getAll("needs").filter((v): v is string => typeof v === "string" && isNeed(v)),
    ),
  ];
  const values = { name: field(formData, "name").slice(0, 200), needs };
  const name = nameSchema.safeParse(values.name);
  if (!name.success) {
    return {
      status: "error",
      message: "Please check the highlighted field.",
      fieldErrors: { name: name.error.issues[0]!.message },
      values,
    };
  }
  try {
    await getPrisma().user.update({
      where: { id: user.id },
      data: { name: name.data, accessibilityNeeds: needs },
    });
  } catch {
    return { status: "error", message: "We couldn't save your profile. Please try again.", values };
  }
  revalidatePath("/account", "layout");
  return {
    status: "success",
    message: "Your profile is saved.",
    values: { name: name.data, needs },
  };
}

export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await currentUser("web");
  if (!user) return SIGNED_OUT;
  if (!(await allowAttempt("signIn", "web"))) {
    return { status: "error", message: "Too many attempts. Please wait a while and try again." };
  }
  const next = field(formData, "newPassword");
  if (next !== field(formData, "confirmPassword")) {
    return {
      status: "error",
      message: "Please check the highlighted field.",
      fieldErrors: { confirmPassword: "The two new passwords don't match." },
    };
  }
  const auth = getAuthService();
  const result = await auth.changePassword(user.id, field(formData, "currentPassword"), next);
  if (!result.ok) return { status: "error", message: result.error };
  // All sessions ended with the change; keep this browser signed in.
  const session = await auth.signIn({ email: user.email, password: next, app: "web" });
  if (session.ok) await startSession("web", session.token, session.expiresAt);
  await recordAudit({
    actorUserId: user.id,
    action: "account.password_changed",
    targetType: "user",
    targetId: user.id,
  });
  return {
    status: "success",
    message: "Your password is changed. Other devices have been signed out.",
  };
}
