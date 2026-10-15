import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

/**
 * Daily hospital housekeeping (ADR-068), run by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`:
 * - reminders for appointments in the next 36 hours, sent once each;
 * - deletes accessibility conversations 90 days after they closed.
 */

const REMINDER_WINDOW_MS = 36 * 60 * 60 * 1000;

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 401 });
  const prisma = getPrisma();
  const now = new Date();
  let reminders = 0;
  try {
    const due = await prisma.hospitalAppointment.findMany({
      where: {
        status: "booked",
        reminderSentAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
      },
      include: {
        organization: { select: { name: true } },
        department: { select: { name: true } },
      },
      take: 500,
    });
    for (const a of due) {
      // Claimed first, so an overlapping run cannot send a second reminder.
      const { count } = await prisma.hospitalAppointment.updateMany({
        where: { id: a.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (count === 0) continue;
      await notify(a.patientId, {
        title: `Reminder: appointment at ${a.organization.name}`,
        body: `${a.department.name}, ${when.format(a.startsAt)}. If you cannot come, cancel it from your account so someone else can have the time.`,
        link: "/account",
      });
      reminders++;
    }
    const { count: deleted } = await prisma.accessConversation.deleteMany({
      where: { status: "closed", deleteAfter: { lte: now } },
    });
    console.info(JSON.stringify({ event: "hospital_cron", reminders, deleted }));
    return Response.json({ reminders, deleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "hospital_cron_error",
        reminders,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
