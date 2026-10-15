import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { getStorage } from "@/lib/storage/cloudinary";

/**
 * Opens one of the signed-in nutritionist's own documents through a signed
 * Cloudinary link that expires after 5 minutes (ADR-064).
 */
export async function GET(_request: Request, ctx: RouteContext<"/nutritionist/documents/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser("web");
  if (!user) return new Response(null, { status: 401 });
  const storage = getStorage();
  const doc = storage
    ? await getPrisma().qualificationDocument.findFirst({
        where: { id, profileId: user.id },
        select: { publicId: true, format: true },
      })
    : null;
  if (!storage || !doc) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 303,
    headers: {
      Location: storage.privateDownloadUrl(doc.publicId, doc.format),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
