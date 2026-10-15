import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

const API = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;

/**
 * Paystack (https://paystack.com/docs). Checkout initialises a transaction
 * with the plan code, so Paystack creates the subscription and charges each
 * renewal. Webhooks are signed with HMAC-SHA512 of the raw body using the
 * secret key (x-paystack-signature).
 */
export class PaystackProvider implements PaymentProvider {
  readonly kind = "paystack" as const;

  constructor(
    private readonly secretKey: string,
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
    if (!response.ok || pick(body, "status") !== true) {
      throw new PaystackError(response.status);
    }
    return pick(body, "data");
  }

  async startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    try {
      const data = await this.call("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          // Paystack uses the plan's amount when a plan is given; sent for completeness.
          amount: input.amountMinor,
          currency: input.currency,
          reference: input.reference,
          plan: input.providerPlanId,
          callback_url: input.callbackUrl,
        }),
      });
      const url = str(pick(data, "authorization_url"));
      return url?.startsWith("https://") ? { ok: true, url } : { ok: false, error: "rejected" };
    } catch (error) {
      return { ok: false, error: classify(error) };
    }
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.call(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = pick(data, "status");
    const amount = num(pick(data, "amount"));
    const currency = str(pick(data, "currency"));
    if (status === "success" && amount !== null && currency) {
      return { status: "success", amountMinor: Math.round(amount), currency };
    }
    return { status: status === "failed" || status === "abandoned" ? "failed" : "pending" };
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    const signature = headers.get("x-paystack-signature") ?? "";
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    if (!safeEqual(signature, expected)) return { ok: false };
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false };
    }
    const eventType = str(pick(body, "event")) ?? "unknown";
    // Paystack events carry no event id; the body hash identifies a delivery.
    const eventId = createHash("sha256").update(rawBody).digest("hex");
    return { ok: true, eventId, eventType, event: toBillingEvent(eventType, pick(body, "data")) };
  }

  async cancel(sub: Parameters<PaymentProvider["cancel"]>[0]) {
    if (!sub.subscriptionRef || !sub.token)
      return { ok: false as const, error: "rejected" as const };
    try {
      await this.call("/subscription/disable", {
        method: "POST",
        body: JSON.stringify({ code: sub.subscriptionRef, token: sub.token }),
      });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: classify(error) };
    }
  }
}

function toBillingEvent(eventType: string, data: unknown): BillingEvent {
  const email = str(pick(data, "customer", "email"));
  const plan = str(pick(data, "plan", "plan_code"));
  if (!email) return { type: "ignored" };
  switch (eventType) {
    case "charge.success": {
      const reference = str(pick(data, "reference"));
      const amount = num(pick(data, "amount"));
      const currency = str(pick(data, "currency"));
      if (!reference || amount === null || !currency) return { type: "ignored" };
      return {
        type: "payment.succeeded",
        reference,
        email,
        providerPlanId: plan,
        subscriptionRef: null,
        amountMinor: Math.round(amount),
        currency,
      };
    }
    case "subscription.create": {
      const code = str(pick(data, "subscription_code"));
      if (!code) return { type: "ignored" };
      return {
        type: "subscription.created",
        subscriptionRef: code,
        token: str(pick(data, "email_token")),
        email,
        providerPlanId: plan,
      };
    }
    case "subscription.disable":
    case "subscription.not_renew":
      return {
        type: "subscription.canceled",
        subscriptionRef: str(pick(data, "subscription_code")),
        email,
        providerPlanId: plan,
      };
    case "invoice.payment_failed":
      return {
        type: "payment.failed",
        subscriptionRef: str(pick(data, "subscription", "subscription_code")),
        email,
        providerPlanId: plan,
      };
    default:
      return { type: "ignored" };
  }
}

export class PaystackError extends Error {
  constructor(readonly status: number) {
    super(`Paystack request failed (${status})`);
    this.name = "PaystackError";
  }
}

function classify(error: unknown) {
  return error instanceof PaystackError && error.status >= 400 && error.status < 500
    ? ("rejected" as const)
    : ("unreachable" as const);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
