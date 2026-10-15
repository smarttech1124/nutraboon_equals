/**
 * Payment providers behind one interface (ADR-063). Paystack and Flutterwave
 * both run the recurring billing; the app only starts checkouts, verifies
 * payments with the provider's API and applies webhook events. Card details
 * never touch this server.
 */

export type ProviderKind = "paystack" | "flutterwave";

export type CheckoutInput = {
  /** Our reference, unique per checkout (Subscription.checkoutReference). */
  reference: string;
  email: string;
  name: string;
  amountMinor: number;
  currency: string;
  /** The provider's plan: a Paystack plan code or a Flutterwave payment plan id. */
  providerPlanId: string;
  callbackUrl: string;
};

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: ProviderError };

export type VerifiedPayment =
  { status: "success"; amountMinor: number; currency: string } | { status: "failed" | "pending" };

export type ProviderError = "not_configured" | "rejected" | "unreachable";

/** A webhook, reduced to what billing needs. */
export type BillingEvent =
  | {
      type: "payment.succeeded";
      /** Transaction reference: ours for a first payment, the provider's for a renewal. */
      reference: string;
      email: string;
      providerPlanId: string | null;
      subscriptionRef: string | null;
      amountMinor: number;
      currency: string;
    }
  | {
      type: "subscription.created";
      subscriptionRef: string;
      /** Paystack's email_token, needed to cancel. */
      token: string | null;
      email: string;
      providerPlanId: string | null;
    }
  | {
      type: "subscription.canceled";
      subscriptionRef: string | null;
      email: string;
      providerPlanId: string | null;
    }
  | {
      type: "payment.failed";
      subscriptionRef: string | null;
      email: string;
      providerPlanId: string | null;
    }
  | { type: "ignored" };

export type ParsedWebhook =
  { ok: false } | { ok: true; eventId: string; eventType: string; event: BillingEvent };

export interface PaymentProvider {
  readonly kind: ProviderKind;
  startCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verify(reference: string): Promise<VerifiedPayment>;
  /** Checks the signature first; returns { ok: false } for anything not from the provider. */
  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook;
  /** Stops renewals. The subscriber keeps access until the paid period ends. */
  cancel(sub: {
    subscriptionRef: string | null;
    token: string | null;
    email: string;
    providerPlanId: string | null;
  }): Promise<{ ok: true } | { ok: false; error: ProviderError }>;
}

export type Fetch = typeof fetch;

export const PROVIDER_LABEL: Record<ProviderKind, string> = {
  paystack: "Paystack",
  flutterwave: "Flutterwave",
};

/** Reads a nested value from untrusted JSON. */
export function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function str(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
