"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { hashPassword } from "@/lib/admin/password";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, getAuthService } from "@/lib/auth/next";
import { isAdminRole, ROLE_LABEL } from "@/lib/auth/permissions";
import { emailSchema, passwordSchema } from "@/lib/auth/service";
import { getPrisma } from "@/lib/db";
import { adminAppUrl, appUrl, getEmailSender } from "@/lib/email";
import { resetPasswordMessage } from "@/lib/email/templates";

/**
 * Administrator accounts (ADR-061, ADR-080). Every action needs
 * "roles.manage". The last super administrator cannot lose that role, and an
 * account without any role left loses its n-equals sessions and becomes an
 * ordinary platform user again.
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const PATHS = ["/admins", "/users"];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));

export async function setAdminRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = field(formData, "userId");
  const role = field(formData, "role");
  const grant = field(formData, "grant") === "true";
  if (!userId || !isAdminRole(role)) return FAILED;
  return asAdmin("roles.manage", "admin_role", async (admin) => {
    const prisma = getPrisma();
    if (grant) {
      await prisma.adminRoleAssignment.upsert({
        where: { userId_role: { userId, role } },
        create: { userId, role },
        update: {},
      });
    } else {
      const removed = await prisma.$transaction(
        async (tx) => {
          if (role === "super_admin") {
            const supers = await tx.adminRoleAssignment.count({ where: { role: "super_admin" } });
            if (supers <= 1) return false;
          }
          await tx.adminRoleAssignment.deleteMany({ where: { userId, role } });
          // Without any role left, their admin sessions end.
          if ((await tx.adminRoleAssignment.count({ where: { userId } })) === 0) {
            await tx.session.deleteMany({ where: { userId, app: "admin" } });
          }
          return true;
        },
        { isolationLevel: "Serializable" },
      );
      if (!removed) {
        return {
          status: "error",
          message: "There must always be at least one super administrator.",
        };
      }
    }
    await recordAudit({
      actorUserId: admin.id,
      action: grant ? "admin_role.granted" : "admin_role.removed",
      targetType: "user",
      targetId: userId,
      metadata: { role },
    });
    refresh();
    return { status: "success", message: grant ? "Role added." : "Role removed." };
  });
}

export type AddAdminState = ActionState & {
  fieldErrors?: Record<string, string>;
  /** What was submitted (never the password), so the form keeps it after an error. */
  values?: { email?: string; name?: string; role?: string };
};

/**
 * Gives an administrator role to an existing account, or creates the account
 * first when the email is new (name and a temporary password are then
 * required; the person should change it under My profile).
 */
export async function addAdminAction(
  _prev: AddAdminState,
  formData: FormData,
): Promise<AddAdminState> {
  const values = {
    email: field(formData, "email").slice(0, 200),
    name: field(formData, "name").slice(0, 200),
    role: field(formData, "role"),
  };
  const email = emailSchema.safeParse(values.email);
  if (!email.success) {
    return {
      status: "error",
      message: "Please check the highlighted field.",
      fieldErrors: { email: email.error.issues[0]!.message },
      values,
    };
  }
  const role = values.role;
  if (!isAdminRole(role)) return { ...FAILED, values };
  const password = field(formData, "password");
  return asAdmin("roles.manage", "admin_add", async (admin) => {
    const prisma = getPrisma();
    let user = await prisma.user.findUnique({
      where: { email: email.data },
      select: { id: true, status: true },
    });
    let created = false;
    if (!user) {
      const name = values.name.trim();
      const errors: Record<string, string> = {};
      if (!name) errors.name = "Enter a name for the new account.";
      else if (name.length > 100) errors.name = "That name is too long.";
      const parsed = passwordSchema.safeParse(password);
      if (!parsed.success) errors.password = parsed.error.issues[0]!.message;
      if (Object.keys(errors).length > 0) {
        return {
          status: "error",
          message: "There is no account with that email. Add a name and a temporary password.",
          fieldErrors: errors,
          values,
        };
      }
      user = await prisma.user.create({
        data: { email: email.data, name, passwordHash: await hashPassword(parsed.data!) },
        select: { id: true, status: true },
      });
      created = true;
    }
    if (user.status !== "active") {
      return {
        status: "error",
        message: "That account is suspended. Reactivate it under Platform users first.",
        values,
      };
    }
    await prisma.adminRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role } },
      create: { userId: user.id, role },
      update: {},
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "admin_role.granted",
      targetType: "user",
      targetId: user.id,
      metadata: { role, newAccount: created },
    });
    refresh();
    return {
      status: "success",
      message: created
        ? `Account created with the ${ROLE_LABEL[role]} role. Share the temporary password privately.`
        : `${ROLE_LABEL[role]} role added.`,
    };
  });
}

/**
 * Starts a password reset for another administrator (needs "roles.manage").
 * The acting administrator re-enters their own password. The target's
 * password and sessions stop working at once, and a one-hour reset link is
 * emailed to the target's own address. The link, token and any password are
 * never shown in n-equals or written to the audit log.
 */
export async function resetAdminPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = field(formData, "userId");
  if (!userId) return { status: "error", message: "Choose an administrator." };
  const password = field(formData, "password").slice(0, 200);
  if (!password) return { status: "error", message: "Enter your own password to confirm." };
  if (!(await allowAttempt("reset", "admin"))) {
    return { status: "error", message: "Too many attempts. Wait a while and try again." };
  }
  const sender = getEmailSender();
  if (!sender.available) {
    return {
      status: "error",
      message: "Email is not set up, so a reset link can't be sent. Nothing was changed.",
    };
  }
  return asAdmin("roles.manage", "admin_password_reset", async (admin) => {
    const result = await getAuthService().adminPasswordReset(admin.id, password, userId);
    if (!result.ok) return { status: "error", message: result.error };
    await recordAudit({
      actorUserId: admin.id,
      action: "admin_password.reset",
      targetType: "user",
      targetId: userId,
    });
    try {
      await sender.send({
        to: result.email,
        ...resetPasswordMessage(result.token, appUrl(), adminAppUrl()),
      });
    } catch {
      return {
        status: "error",
        message:
          "Their password was blocked and they were signed out, but the email could not be sent. Try again to send a new link.",
      };
    }
    refresh();
    return {
      status: "success",
      message:
        "Done. Their old password no longer works, they were signed out everywhere, and a reset link (valid for 1 hour) was emailed to them.",
    };
  });
}
