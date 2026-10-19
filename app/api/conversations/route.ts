import { currentUser } from "@/lib/auth/next";
import { getChatHistory } from "@/lib/http/chat-deps";

/**
 * The signed-in user's saved chats and their plan's limits (ADR-090). Chats
 * past the plan's retention are deleted before the list is read. Guests get
 * 401: their chats are never saved.
 */
export async function GET() {
  const history = getChatHistory();
  const user = history ? await currentUser("web") : null;
  if (!history || !user) return new Response(null, { status: 401 });
  const { policy, chats } = await history.list(user.id);
  return Response.json(
    {
      enabled: policy.enabled,
      max: policy.maxSaved,
      retentionDays: policy.retentionDays,
      chats: chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
