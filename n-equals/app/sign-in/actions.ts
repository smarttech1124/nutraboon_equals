"use server";

import { redirect } from "next/navigation";
import { allowAttempt, endSession, getAuthService, startSession } from "@/lib/auth/next";
import { recordAudit } from "@/lib/audit";

export type SignInState = { status: "idle" | "error"; message: string };

/** Administrator sign-in (ADR-061): user accounts with an admin role, 8-hour sessions. */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await allowAttempt("signIn", "admin"))) {
    return { status: "error", message: "Too many attempts. Wait 15 minutes and try again." };
  }
  const email = String(formData.get("email") ?? "");
  const result = await getAuthService().signIn({
    email,
    password: String(formData.get("password") ?? ""),
    app: "admin",
  });
  if (!result.ok) {
    console.info(JSON.stringify({ event: "admin_login", outcome: "failure" }));
    return { status: "error", message: result.error };
  }
  await startSession("admin", result.token, result.expiresAt);
  await recordAudit({
    actorUserId: result.user.id,
    action: "admin.signed_in",
    targetType: "user",
    targetId: result.user.id,
  });
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await endSession("admin");
  redirect("/sign-in");
}
