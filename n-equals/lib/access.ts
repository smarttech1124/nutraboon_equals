import type { ActionState } from "@/components/ui/action-form";
import { redirect } from "next/navigation";
import { AuthRequiredError, ForbiddenError, requireAdmin } from "@/lib/auth/next";
import type { Permission } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/service";

/**
 * For n-equals pages: sends signed-out visitors to sign-in, and tells the page
 * when the administrator lacks the permission so it can say so (ADR-061).
 * Server actions check again themselves: they can be called directly.
 */
export async function adminAccess(
  permission?: Permission,
): Promise<{ ok: true; user: AuthUser } | { ok: false }> {
  try {
    return { ok: true, user: await requireAdmin(permission) };
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect("/sign-in");
    if (error instanceof ForbiddenError) return { ok: false };
    throw error;
  }
}

export type { ActionState };

export const SIGNED_OUT: ActionState = {
  status: "error",
  message: "Your admin session has ended. Sign in again.",
};
export const NOT_ALLOWED: ActionState = {
  status: "error",
  message: "Your role does not allow this.",
};
export const FAILED: ActionState = {
  status: "error",
  message: "Something went wrong. Nothing was changed; try again.",
};

/** Runs an admin action with its permission check, mapping failures to safe messages. */
export async function asAdmin<T extends ActionState>(
  permission: Permission,
  action: string,
  run: (user: AuthUser) => Promise<T>,
): Promise<T | ActionState> {
  let user: AuthUser;
  try {
    user = await requireAdmin(permission);
  } catch (error) {
    if (error instanceof AuthRequiredError) return SIGNED_OUT;
    if (error instanceof ForbiddenError) return NOT_ALLOWED;
    throw error;
  }
  try {
    return await run(user);
  } catch (error) {
    // The error name only: messages could echo input.
    console.error(
      JSON.stringify({
        event: "admin_action_error",
        action,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return FAILED;
  }
}
