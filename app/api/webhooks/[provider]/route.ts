import { getPrisma } from "@/lib/db";
import { getBillingProcessor, getPaymentProvider } from "@/lib/payments";
import { PrismaBillingStore } from "@/lib/payments/store";

/**
 * Payment webhooks (ADR-063): POST /api/webhooks/paystack and
 * /api/webhooks/flutterwave. The signature is checked before anything is
 * read; each delivery is applied once; a failure answers 500 so the
 * provider retries. Responses carry no detail.
 */

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider: kind } = await ctx.params;
  if (kind !== "paystack" && kind !== "flutterwave") return new Response(null, { status: 404 });
  const provider = getPaymentProvider(kind);
  if (!provider) return new Response(null, { status: 404 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const parsed = provider.parseWebhook(raw, request.headers);
  if (!parsed.ok) return new Response(null, { status: 401 });

  const store = new PrismaBillingStore(getPrisma());
  if (!(await store.recordEvent(kind, parsed.eventId, parsed.eventType))) {
    return new Response(null, { status: 200 }); // already applied
  }
  try {
    await getBillingProcessor(provider).handle(parsed.event);
  } catch (error) {
    await store.forgetEvent(kind, parsed.eventId).catch(() => {});
    console.error(
      JSON.stringify({
        event: "payment_webhook_error",
        provider: kind,
        type: parsed.eventType,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return new Response(null, { status: 500 });
  }
  console.info(
    JSON.stringify({ event: "payment_webhook", provider: kind, type: parsed.eventType }),
  );
  return new Response(null, { status: 200 });
}
