import { timingSafeEqual } from "node:crypto";
import { getChatHistory } from "@/lib/http/chat-deps";

/**
 * Daily (Vercel Cron, `Authorization: Bearer $CRON_SECRET`): deletes saved
 * chats unused for longer than their owner's plan keeps them (ADR-090), so
 * chats of people who never come back do not stay forever.
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 401 });
  const history = getChatHistory();
  if (!history) return Response.json({ deleted: 0 });
  const deleted = await history.sweep();
  console.info(JSON.stringify({ event: "chat_history_swept", deleted }));
  return Response.json({ deleted });
}
