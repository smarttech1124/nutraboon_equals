"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProfileState } from "@/app/(account)/account/profile/actions";
import { recordAudit } from "@/lib/audit";
import {
  allowAttempt,
  currentUser,
  getAuthService,
  SESSION_COOKIE,
  startSession,
} from "@/lib/auth/next";
import { hashToken } from "@/lib/auth/service";
import { getPrisma } from "@/lib/db";

/**
 * The signed-in administrator's own account (ADR-080). Any administrator may
 * use these, whatever their role; each action checks the admin session itself.
 */

const SIGNED_OUT: ProfileState = {
  status: "error",
  message: "Your admin session has ended. Sign in again.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const nameSchema = z.string().trim().min(1, "Enter your name.").max(100, "That name is too long.");

export async function updateAdminNameAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await currentUser("admin");
  if (!user) return SIGNED_OUT;
  const raw = field(formData, "name").slice(0, 200);
  const name = nameSchema.safeParse(raw);
  if (!name.success) {
    return {
      status: "error",
      message: "Please check the highlighted field.",
      fieldErrors: { name: name.error.issues[0]!.message },
      values: { name: raw },
    };
  }
  try {
    await getPrisma().user.update({ where: { id: user.id }, data: { name: name.data } });
  } catch {
    return {
      status: "error",
      message: "We couldn't save your name. Try again.",
      values: { name: raw },
    };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: "Your name is saved.", values: { name: name.data } };
}

export async function changeAdminPasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await currentUser("admin");
  if (!user) return SIGNED_OUT;
  if (!(await allowAttempt("signIn", "admin"))) {
    return { status: "error", message: "Too many attempts. Wait a while and try again." };
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
  // Every session ended with the change; keep this browser signed in to n-equals.
  const session = await auth.signIn({ email: user.email, password: next, app: "admin" });
  if (session.ok) await startSession("admin", session.token, session.expiresAt);
  await recordAudit({
    actorUserId: user.id,
    action: "account.password_changed",
    targetType: "user",
    targetId: user.id,
  });
  return {
    status: "success",
    message: "Your password is changed. You were signed out everywhere else.",
  };
}

/** Ends every other session of this account (main site and n-equals), keeping this one. */
export async function signOutOtherSessionsAction(): Promise<ProfileState> {
  const user = await currentUser("admin");
  if (!user) return SIGNED_OUT;
  const token = (await cookies()).get(SESSION_COOKIE.admin)?.value;
  if (!token) return SIGNED_OUT;
  const { count } = await getPrisma().session.deleteMany({
    where: { userId: user.id, id: { not: hashToken(token) } },
  });
  await recordAudit({
    actorUserId: user.id,
    action: "account.other_sessions_ended",
    targetType: "user",
    targetId: user.id,
  });
  revalidatePath("/profile");
  return {
    status: "success",
    message:
      count === 0
        ? "There were no other sessions."
        : `Signed out of ${count} other session${count === 1 ? "" : "s"}.`,
  };
}
