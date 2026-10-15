import { getPrisma } from "@/lib/db";
import { isListedProduct } from "@/lib/vendors/directory";
import { parseLocations } from "@/lib/vendors/product";
import { countQuietly } from "@/lib/vendors/stats";

/**
 * "Where to buy" links (ADR-067): counts the click for the vendor's
 * analytics, then sends the browser to the shop. Only https links stored on
 * a listed product are followed, so this cannot be used as an open redirect.
 */
export async function GET(_request: Request, ctx: RouteContext<"/products/[id]/go/[index]">) {
  const { id, index } = await ctx.params;
  if (!(await isListedProduct(id))) return new Response(null, { status: 404 });
  const product = await getPrisma().product.findUnique({
    where: { id },
    select: { purchaseLocations: true },
  });
  const url = parseLocations(product?.purchaseLocations)[Number(index)]?.url;
  if (!url || !url.startsWith("https://")) return new Response(null, { status: 404 });
  await countQuietly([id], "clicks");
  return new Response(null, {
    status: 303,
    headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
