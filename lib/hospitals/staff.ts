import { NO_PASSWORD } from "@/lib/auth/service";
import { getPrisma } from "@/lib/db";
import { getEmailSender } from "@/lib/email";
import { staffInviteMessage } from "@/lib/email/templates";
import { notify } from "@/lib/notifications";

/**
 * Hospital staff activation (ADR-089). Staff a hospital adds before it is
 * verified stay pending: they cannot open the portal and are not notified
 * about patients. When the hospital is verified, every pending member is
 * activated and told, by email and in the app. The owner is always active,
 * so the hospital can be set up while it waits for verification.
 */

export function isActiveMember(member: { role: string; activatedAt: Date | null }): boolean {
  return member.role === "owner" || member.activatedAt !== null;
}

/**
 * Tells a newly active staff member: a notification for everyone, and an
 * invitation email (with how to set a password) for an account made for them.
 */
export async function announceActivation(
  member: { userId: string },
  org: { name: string },
  newAccount: boolean,
): Promise<void> {
  await notify(member.userId, {
    title: `You can now use the ${org.name} hospital portal`,
    body: "See appointments and patient messages for your departments.",
    link: "/hospital",
  });
  if (!newAccount) return;
  const user = await getPrisma().user.findUnique({
    where: { id: member.userId },
    select: { email: true },
  });
  const sender = getEmailSender();
  if (!user || !sender.available) return;
  try {
    await sender.send({
      to: user.email,
      idempotencyKey: `staff-invite/${member.userId}`,
      ...staffInviteMessage({ hospitalName: org.name, email: user.email }),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "staff_invite_failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}

/** Activates every pending member of a hospital; returns how many. Called on verification. */
export async function activateHospitalStaff(organizationId: string): Promise<number> {
  const prisma = getPrisma();
  const pending = await prisma.membership.findMany({
    where: { organizationId, activatedAt: null },
    select: { userId: true, user: { select: { passwordHash: true, sessions: { take: 1 } } } },
  });
  if (pending.length === 0) return 0;
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });
  await prisma.membership.updateMany({
    where: { organizationId, activatedAt: null },
    data: { activatedAt: new Date() },
  });
  for (const member of pending) {
    // An account made for them has never been signed in to: it needs the invitation.
    const newAccount =
      member.user.sessions.length === 0 && member.user.passwordHash === NO_PASSWORD;
    await announceActivation(member, org, newAccount);
  }
  return pending.length;
}
