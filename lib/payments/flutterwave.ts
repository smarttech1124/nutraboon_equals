import { createHash } from "node:crypto";
import { safeEqual } from "./paystack";
import {
  num,
  pick,
  str,
  type BillingEvent,
  type CheckoutInput,
  type CheckoutResult,
  type Fetch,
  type ParsedWebhook,
  type PaymentProvider,
  type VerifiedPayment,
} from "./types";

const API = "https://api.flutterwave.com/v3";
const TIMEOUT_MS = 15_000;

/**
 * Flutterwave v3 (https://developer.flutterwave.com). Checkout uses the
 * hosted payment page with `payment_plan`, so Flutterwave charges renewals.
 * Webhooks carry the secret hash configured in the dashboard in the
 * `verif-hash` header; every payment is then re-verified through the API,
 * as Flutterwave recommends. Amounts are in major units (naira).
 */
export class FlutterwaveProvider implements PaymentProvider {
  readonly kind = "flutterwave" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookHash: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || pick(body, "status") !== "success") {
      throw new FlutterwaveError(response.status);
    }
    return pick(body, "data");
  }

  async startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    try {
      const planId = Number(input.providerPlanId);
      if (!Number.isInteger(planId)) return { ok: false, error: "rejected" };
      const data = await this.call("/payments", {
        method: "POST",
        body: JSON.stringify({
          tx_ref: input.reference,
          amount: input.amountMinor / 100,
          currency: input.currency,
          redirect_url: input.callbackUrl,
          payment_plan: planId,
          customer: { email: input.email, name: input.name },
          customizations: { title: "Nutraboom Equals" },
        }),
      });
      const url = str(pick(data, "link"));
      return url?.startsWith("https://") ? { ok: true, url } : { ok: false, error: "rejected" };
    } catch (error) {
      return { ok: false, error: classify(error) };
    }
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.call(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    );
    const status = pick(data, "status");
    const amount = num(pick(data, "amount"));
    const currency = str(pick(data, "currency"));
    if (status === "successful" && amount !== null && currency) {
      return { status: "success", amountMinor: Math.round(amount * 100), currency };
    }
    return { status: status === "failed" ? "failed" : "pending" };
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    if (!this.webhookHash || !safeEqual(headers.get("verif-hash") ?? "", this.webhookHash)) {
      return { ok: false };
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    const eventType = str(pick(body, "event")) ?? "unknown";
    const eventId = createHash("sha256").update(rawBody).digest("hex");
    return { ok: true, eventId, eventType, event: toBillingEvent(eventType, pick(body, "data")) };
  }

  async cancel(sub: Parameters<PaymentProvider["cancel"]>[0]) {
    try {
      let id = sub.subscriptionRef;
      if (!id) {
        // Flutterwave's webhooks do not name the subscription: look it up.
        const params = new URLSearchParams({ email: sub.email, status: "active" });
        if (sub.providerPlanId) params.set("plan", sub.providerPlanId);
        const list = await this.call(`/subscriptions?${params}`);
        id = Array.isArray(list) ? str(pick(list[0], "id")) : null;
      }
      if (!id) return { ok: false as const, error: "rejected" as const };
      await this.call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "PUT" });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: classify(error) };
    }
  }
}

function toBillingEvent(eventType: string, data: unknown): BillingEvent {
  const email = str(pick(data, "customer", "email"));
  if (!email) return { type: "ignored" };
  if (eventType === "charge.completed") {
    const reference = str(pick(data, "tx_ref"));
    const amount = num(pick(data, "amount"));
    const currency = str(pick(data, "currency"));
    if (pick(data, "status") !== "successful" || !reference || amount === null || !currency) {
      return { type: "ignored" };
    }
    return {
      type: "payment.succeeded",
      reference,
      email,
      providerPlanId: str(pick(data, "payment_plan")) ?? str(pick(data, "plan")),
      subscriptionRef: null,
      amountMinor: Math.round(amount * 100),
      currency,
    };
  }
  if (eventType === "subscription.cancelled") {
    return {
      type: "subscription.canceled",
      subscriptionRef: null,
      email,
      providerPlanId: str(pick(data, "plan", "id")),
    };
  }
  return { type: "ignored" };
}

export class FlutterwaveError extends Error {
  constructor(readonly status: number) {
    super(`Flutterwave request failed (${status})`);
    this.name = "FlutterwaveError";
  }
}

function classify(error: unknown) {
  return error instanceof FlutterwaveError && error.status >= 400 && error.status < 500
    ? ("rejected" as const)
    : ("unreachable" as const);
}
