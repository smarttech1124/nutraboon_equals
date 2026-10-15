import { z } from "zod";
import { allowAttempt } from "@/lib/auth/next";
import { getSignProvider } from "@/lib/sign";
import { SIGN_MODULES } from "@/lib/sign/types";

/**
 * A sign-language response for a reply (ADR-077). Used by every module that
 * shows replies (assistant, Meal Planner, hospital messages). The provider
 * decides what comes back; today that is a random demonstration video.
 *
 * Videos that failed to play in the browser are reported in `failed` and
 * logged by id only. The reply text is passed to the provider and never
 * logged or stored here.
 */

const MAX_BODY = 16_000;
const id = z.string().regex(/^[a-z0-9-]{1,60}$/);
const bodySchema = z.object({
  text: z.string().max(4000),
  module: z.enum(SIGN_MODULES),
  exclude: z.array(id).max(30).default([]),
  failed: z.array(id).max(30).default([]),
});

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return json({ status: "error" }, 413);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ status: "error" }, 400);
  const { text, module, exclude, failed } = parsed.data;

  for (const videoId of failed) {
    console.warn(JSON.stringify({ event: "sign_video_failed", videoId, module }));
  }

  const provider = getSignProvider();
  if (!provider || !provider.available) return json({ status: "unavailable" });
  if (!(await allowAttempt("signVideo", "web"))) return json({ status: "busy" }, 429);

  try {
    const response = await provider.respond({ text, module, exclude: [...exclude, ...failed] });
    return response ? json({ status: "ok", response }) : json({ status: "none" });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "sign_provider_error",
        provider: provider.id,
        module,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return json({ status: "error" }, 502);
  }
}
