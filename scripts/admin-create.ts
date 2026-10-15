/**
 * Creates (or promotes) a platform administrator (ADR-061).
 * Run: npm run admin:create
 *
 * Asks for an email, a name for a new account, the password (hidden, for a
 * new account) and the role (super_admin by default). An existing account
 * keeps its password and gets the role added. Use this for the first super
 * administrator; after that, roles are managed in n-equals.
 */
import { readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import { hashPassword } from "../lib/admin/password";
import { ADMIN_ROLES, isAdminRole } from "../lib/auth/permissions";
import { PASSWORD_MIN } from "../lib/auth/service";
import { createPrismaClient } from "../lib/db";
import { ask, closePrompts } from "./prompt";

async function main(): Promise<void> {
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const url = process.env.DATABASE_URL ?? local.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (e.g. in .env.local) first.");
  const prisma = createPrismaClient(url);
  try {
    const email = (await ask("Administrator email: ")).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That is not an email address.");
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const name = await ask("Name: ");
      const password = await ask(`Password (at least ${PASSWORD_MIN} characters): `, {
        hidden: true,
      });
      if (password.length < PASSWORD_MIN)
        throw new Error(`Use at least ${PASSWORD_MIN} characters.`);
      const again = await ask("Repeat the password: ", { hidden: true });
      if (again !== password) throw new Error("The passwords do not match.");
      user = await prisma.user.create({
        data: { email, name: name || email, passwordHash: await hashPassword(password) },
      });
      console.log(`Created account for ${email}.`);
    }
    const roleAnswer =
      (await ask(`Role [${ADMIN_ROLES.join(", ")}] (super_admin): `)) || "super_admin";
    if (!isAdminRole(roleAnswer)) throw new Error(`Unknown role "${roleAnswer}".`);
    await prisma.adminRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: roleAnswer } },
      create: { userId: user.id, role: roleAnswer },
      update: {},
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: null,
        action: "admin_role.granted",
        targetType: "user",
        targetId: user.id,
        metadata: { role: roleAnswer, via: "admin:create script" },
      },
    });
    console.log(`${email} now has the ${roleAnswer} role. Sign in at the n-equals portal.`);
  } finally {
    closePrompts();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
