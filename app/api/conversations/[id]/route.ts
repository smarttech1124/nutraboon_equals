import { currentUser } from "@/lib/auth/next";
import { getChatHistory } from "@/lib/http/chat-deps";

/**
 * One saved chat (ADR-090): its messages to reopen it, or DELETE to remove
 * it. Only its owner can do either; anyone else gets 404, the same as for a
 * chat that does not exist.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };
const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const history = getChatHistory();
  const user = history ? await currentUser("web") : null;
  if (!history || !user) return new Response(null, { status: 401 });
  if (!ID.test(id)) return new Response(null, { status: 404 });
  const result = await history.open(user.id, id);
  if (!result.ok) {
    return result.reason === "unavailable"
      ? Response.json({ error: "Chat history is not included in your plan." }, { status: 403 })
      : new Response(null, { status: 404 });
  }
  const { chat } = result;
  return Response.json(
    {
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt.toISOString(),
      messages: chat.messages,
    },
    { headers: NO_STORE },
  );
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const history = getChatHistory();
  const user = history ? await currentUser("web") : null;
  if (!history || !user) return new Response(null, { status: 401 });
  if (!ID.test(id) || !(await history.remove(user.id, id))) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
