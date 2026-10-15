"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";

/**
 * Platform user administration (ADR-061, ADR-080). Suspending needs
 * "users.manage"; deleting needs "users.delete". Nobody can act on their own
 * account here, and administrators are managed in the Administrators module:
 * remove their roles there first.
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const IS_ADMIN: ActionState = {
  status: "error",
  message: "This account is an administrator. Remove its roles under Administrators first.",
};

export async function setUserStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = field(formData, "userId");
  const status = field(formData, "status");
  if (!userId || (status !== "active" && status !== "suspended")) return FAILED;
  return asAdmin("users.manage", "user_status", async (admin) => {
    if (userId === admin.id) {
      return { status: "error", message: "You can't change the status of your own account." };
    }
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });
      // Suspension takes effect at once: every session of that account ends.
      if (status === "suspended") await tx.session.deleteMany({ where: { userId } });
    });
    await recordAudit({
      actorUserId: admin.id,
      action: status === "suspended" ? "user.suspended" : "user.reactivated",
      targetType: "user",
      targetId: userId,
    });
    revalidatePath("/users");
    return {
      status: "success",
      message: status === "suspended" ? "Account suspended." : "Account reactivated.",
    };
  });
}

/**
 * Deletes a platform account and everything that belongs to it (sessions,
 * subscriptions, meal plans, appointments, nutritionist profile: all cascade
 * in the schema). Cannot be undone. The audit entry keeps the account ID only.
 */
export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = field(formData, "userId");
  if (!userId) return FAILED;
  return asAdmin("users.delete", "user_delete", async (admin) => {
    if (userId === admin.id) {
      return { status: "error", message: "You can't delete your own account." };
    }
    const prisma = getPrisma();
    const outcome = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { _count: { select: { adminRoles: true } } },
        });
        if (!user) return "missing" as const;
        if (user._count.adminRoles > 0) return "admin" as const;
        await tx.user.delete({ where: { id: userId } });
        return "deleted" as const;
      },
      { isolationLevel: "Serializable" },
    );
    if (outcome === "admin") return IS_ADMIN;
    if (outcome === "missing") {
      revalidatePath("/users");
      return { status: "error", message: "That account no longer exists." };
    }
    await recordAudit({
      actorUserId: admin.id,
      action: "user.deleted",
      targetType: "user",
      targetId: userId,
    });
    revalidatePath("/users");
    return { status: "success", message: "Account deleted." };
  });
}
