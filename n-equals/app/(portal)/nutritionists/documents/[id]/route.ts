import { AuthRequiredError, ForbiddenError, requireAdmin } from "@/lib/auth/next";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { getStorage } from "@/lib/storage/cloudinary";

/**
 * Opens a nutritionist's document for a reviewer through a signed Cloudinary
 * link that expires after 5 minutes (ADR-064). Each view is audited.
 */
export async function GET(_request: Request, ctx: RouteContext<"/nutritionists/documents/[id]">) {
  const { id } = await ctx.params;
  let adminId: string;
  try {
    adminId = (await requireAdmin("nutritionists.verify")).id;
  } catch (error) {
    if (error instanceof AuthRequiredError) return new Response(null, { status: 401 });
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
  const storage = getStorage();
  const doc = storage
    ? await getPrisma().qualificationDocument.findUnique({
        where: { id },
        select: { publicId: true, format: true, profileId: true },
      })
    : null;
  if (!storage || !doc) return new Response(null, { status: 404 });
  await recordAudit({
    actorUserId: adminId,
    action: "nutritionist.document_viewed",
    targetType: "nutritionist",
    targetId: doc.profileId,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: storage.privateDownloadUrl(doc.publicId, doc.format),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
