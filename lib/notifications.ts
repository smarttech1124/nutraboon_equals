import { getPrisma } from "@/lib/db";
import { getEmailSender } from "@/lib/email";
import { notificationMessage } from "@/lib/email/templates";

/**
 * In-app notifications, plus an email when a sender is configured (ADR-064).
 * Titles and bodies are fixed wording: never health details or client notes.
 */
export async function notify(
  userId: string,
  message: { title: string; body: string; link?: string },
): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  const notification = await prisma.notification.create({
    data: { userId, title: message.title, body: message.body, link: message.link ?? null },
  });
  const sender = getEmailSender();
  if (!sender.available) return;
  try {
    await sender.send({
      to: user.email,
      idempotencyKey: `notification/${notification.id}`,
      ...notificationMessage(message),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "notification_email_failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}
