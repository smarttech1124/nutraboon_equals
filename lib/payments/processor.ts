import type { BillingEvent, PaymentProvider, ProviderKind } from "./types";

/**
 * Applies checkouts and webhook events to subscriptions (ADR-063). Every
 * payment is verified with the provider's API before it grants anything,
 * and each payment reference extends a subscription at most once.
 */

export type BillingInterval = "monthly" | "yearly";

export type StoredSubscription = {
  id: string;
  status: "pending" | "active" | "past_due" | "canceled" | "expired";
  providerSubscriptionRef: string | null;
  currentPeriodEnd: Date | null;
  plan: { interval: BillingInterval; priceMinor: number; currency: string };
};

export type CustomerQuery = {
  email: string;
  subscriptionRef: string | null;
  providerPlanId: string | null;
  statuses: StoredSubscription["status"][];
};

export interface BillingStore {
  byCheckoutReference(
    provider: ProviderKind,
    reference: string,
  ): Promise<StoredSubscription | null>;
  /** The newest matching subscription of the account with that email. */
  findForCustomer(provider: ProviderKind, query: CustomerQuery): Promise<StoredSubscription | null>;
  /** Activates only while still pending, so two confirmations cannot both apply. */
  activatePending(id: string, start: Date, end: Date): Promise<boolean>;
  extend(id: string, start: Date, end: Date): Promise<void>;
  update(
    id: string,
    data: Partial<{
      providerSubscriptionRef: string;
      providerToken: string | null;
      cancelAtPeriodEnd: boolean;
      status: "past_due";
      graceUntil: Date;
    }>,
  ): Promise<void>;
  /** Records an id once; false when it was already recorded. */
  recordEvent(provider: ProviderKind, eventId: string, type: string): Promise<boolean>;
  forgetEvent(provider: ProviderKind, eventId: string): Promise<void>;
}

export type ConfirmResult = "activated" | "already_active" | "pending" | "failed" | "unknown";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds one billing interval, keeping the day of month where it exists (31 Jan → 28/29 Feb). */
export function addInterval(start: Date, interval: BillingInterval): Date {
  const months = interval === "monthly" ? 1 : 12;
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export class BillingProcessor {
  constructor(
    private readonly store: BillingStore,
    private readonly provider: PaymentProvider,
    private readonly graceDays: () => Promise<number>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** After the provider sends the subscriber back, or on the first-payment webhook. */
  async confirmCheckout(reference: string): Promise<ConfirmResult> {
    const sub = await this.store.byCheckoutReference(this.provider.kind, reference);
    if (!sub) return "unknown";
    if (sub.status !== "pending") return "already_active";
    const payment = await this.provider.verify(reference);
    if (payment.status !== "success") return payment.status;
    if (!this.paysFor(payment, sub)) {
      log("amount_mismatch", this.provider.kind);
      return "failed";
    }
    const start = this.now();
    const activated = await this.store.activatePending(
      sub.id,
      start,
      addInterval(start, sub.plan.interval),
    );
    if (activated)
      await this.store.recordEvent(this.provider.kind, `payment:${reference}`, "checkout");
    return activated ? "activated" : "already_active";
  }

  async handle(event: BillingEvent): Promise<void> {
    const kind = this.provider.kind;
    switch (event.type) {
      case "payment.succeeded": {
        if (await this.store.byCheckoutReference(kind, event.reference)) {
          await this.confirmCheckout(event.reference);
          return;
        }
        await this.renew(event);
        return;
      }
      case "subscription.created": {
        const sub = await this.store.findForCustomer(kind, {
          email: event.email,
          subscriptionRef: null,
          providerPlanId: event.providerPlanId,
          statuses: ["pending", "active", "past_due"],
        });
        if (sub && !sub.providerSubscriptionRef) {
          await this.store.update(sub.id, {
            providerSubscriptionRef: event.subscriptionRef,
            providerToken: event.token,
          });
        }
        return;
      }
      case "subscription.canceled": {
        const sub = await this.find(event);
        // Access continues to the end of the paid period.
        if (sub) await this.store.update(sub.id, { cancelAtPeriodEnd: true });
        return;
      }
      case "payment.failed": {
        const sub = await this.find(event);
        if (sub) {
          const graceUntil = new Date(this.now().getTime() + (await this.graceDays()) * DAY_MS);
          await this.store.update(sub.id, { status: "past_due", graceUntil });
        }
        return;
      }
      case "ignored":
        return;
    }
  }

  private find(event: {
    email: string;
    subscriptionRef: string | null;
    providerPlanId: string | null;
  }) {
    return this.store.findForCustomer(this.provider.kind, {
      email: event.email,
      subscriptionRef: event.subscriptionRef,
      providerPlanId: event.providerPlanId,
      statuses: ["active", "past_due"],
    });
  }

  /** A renewal charge: verified, then the period moves on by one interval. */
  private async renew(event: Extract<BillingEvent, { type: "payment.succeeded" }>) {
    const sub = await this.find(event);
    if (!sub) return;
    const payment = await this.provider.verify(event.reference);
    if (payment.status !== "success" || !this.paysFor(payment, sub)) return;
    if (
      !(await this.store.recordEvent(this.provider.kind, `payment:${event.reference}`, "renewal"))
    ) {
      return; // this payment already extended the subscription
    }
    const now = this.now();
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()
        ? sub.currentPeriodEnd
        : now;
    try {
      await this.store.extend(sub.id, base, addInterval(base, sub.plan.interval));
    } catch (error) {
      // Let the provider's retry apply it.
      await this.store.forgetEvent(this.provider.kind, `payment:${event.reference}`);
      throw error;
    }
  }

  private paysFor(payment: { amountMinor: number; currency: string }, sub: StoredSubscription) {
    return (
      payment.currency.toUpperCase() === sub.plan.currency.toUpperCase() &&
      payment.amountMinor >= sub.plan.priceMinor
    );
  }
}

function log(event: string, provider: ProviderKind) {
  console.warn(JSON.stringify({ event: "billing_" + event, provider }));
}
