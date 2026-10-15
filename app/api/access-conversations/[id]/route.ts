import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";

/**
 * New messages in an accessibility conversation (ADR-068), polled by the
 * patient's and the staff's pages. Only the patient and members of the
 * hospital can read it. Staff names are not shown to patients.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/access-conversations/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser("web");
  if (!user) return new Response(null, { status: 401 });
  const prisma = getPrisma();
  const c = await prisma.accessConversation.findFirst({
    where: {
      id,
      OR: [
        { patientId: user.id },
        { organization: { memberships: { some: { userId: user.id } } } },
      ],
    },
    select: { status: true, assignedUserId: true },
  });
  if (!c) return new Response(null, { status: 404 });
  const after = new URL(request.url).searchParams.get("after");
  const since = after ? new Date(after) : null;
  const messages = await prisma.accessMessage.findMany({
    where: {
      conversationId: id,
      ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, sender: true, text: true, inputMode: true, createdAt: true },
  });
  return Response.json(
    { status: c.status, assigned: c.assignedUserId !== null, messages },
    { headers: { "Cache-Control": "no-store" } },
  );
}
