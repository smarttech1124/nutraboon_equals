import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FlutterwaveProvider } from "@/lib/payments/flutterwave";
import { PaystackProvider } from "@/lib/payments/paystack";
import {
  addInterval,
  BillingProcessor,
  type BillingStore,
  type CustomerQuery,
  type StoredSubscription,
} from "@/lib/payments/processor";
import type { PaymentProvider, VerifiedPayment } from "@/lib/payments/types";

const SECRET = "sk_test_example_not_real";
const NOW = new Date("2026-10-08T12:00:00Z");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new TypeError("fetch failed");
    return next;
  });
  return fn;
}

describe("addInterval", () => {
  it("adds months and years, clamping to the last day of the month", () => {
    expect(addInterval(new Date("2026-01-31T10:00:00Z"), "monthly").toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(addInterval(new Date("2026-10-08T12:00:00Z"), "monthly").toISOString()).toBe(
      "2026-11-08T12:00:00.000Z",
    );
    expect(addInterval(new Date("2028-02-29T00:00:00Z"), "yearly").toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("PaystackProvider", () => {
  it("initialises a checkout with the plan code and returns the authorization URL", async () => {
    const fetch = fakeFetch(
      json({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc" } }),
    );
    const provider = new PaystackProvider(SECRET, fetch);
    const result = await provider.startCheckout({
      reference: "nbe_ref1",
      email: "ada@example.test",
      name: "Ada",
      amountMinor: 150000,
      currency: "NGN",
      providerPlanId: "PLN_test",
      callbackUrl: "http://localhost:3000/account/billing/return?provider=paystack",
    });
    expect(result).toEqual({ ok: true, url: "https://checkout.paystack.com/abc" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: "ada@example.test",
      reference: "nbe_ref1",
      plan: "PLN_test",
      amount: 150000,
    });
  });

  it("maps a 4xx to rejected and a network failure to unreachable", async () => {
    const input = {
      reference: "r",
      email: "a@example.test",
      name: "A",
      amountMinor: 1,
      currency: "NGN",
      providerPlanId: "PLN",
      callbackUrl: "http://localhost:3000/x",
    };
    expect(
      await new PaystackProvider(SECRET, fakeFetch(json({ status: false }, 400))).startCheckout(
        input,
      ),
    ).toEqual({ ok: false, error: "rejected" });
    expect(await new PaystackProvider(SECRET, fakeFetch()).startCheckout(input)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("verifies a transaction in kobo", async () => {
    const provider = new PaystackProvider(
      SECRET,
      fakeFetch(
        json({ status: true, data: { status: "success", amount: 150000, currency: "NGN" } }),
      ),
    );
    expect(await provider.verify("nbe_ref1")).toEqual({
      status: "success",
      amountMinor: 150000,
      currency: "NGN",
    });
  });

  it("accepts only correctly signed webhooks", () => {
    const provider = new PaystackProvider(SECRET, fakeFetch());
    const body = JSON.stringify({
      event: "subscription.create",
      data: {
        subscription_code: "SUB_1",
        email_token: "tok",
        customer: { email: "ada@example.test" },
        plan: { plan_code: "PLN_test" },
      },
    });
    const sign = (key: string) =>
      new Headers({ "x-paystack-signature": createHmac("sha512", key).update(body).digest("hex") });
    expect(provider.parseWebhook(body, sign("wrong")).ok).toBe(false);
    expect(provider.parseWebhook(body, new Headers()).ok).toBe(false);
    const parsed = provider.parseWebhook(body, sign(SECRET));
    expect(parsed).toMatchObject({
      ok: true,
      eventType: "subscription.create",
      event: {
        type: "subscription.created",
        subscriptionRef: "SUB_1",
        token: "tok",
        email: "ada@example.test",
        providerPlanId: "PLN_test",
      },
    });
  });

  it("disables a subscription with its code and email token", async () => {
    const fetch = fakeFetch(json({ status: true, message: "Subscription disabled successfully" }));
    const provider = new PaystackProvider(SECRET, fetch);
    expect(
      await provider.cancel({
        subscriptionRef: "SUB_1",
        token: "tok",
        email: "a@example.test",
        providerPlanId: null,
      }),
    ).toEqual({ ok: true });
    expect(fetch.mock.calls[0][0]).toBe("https://api.paystack.co/subscription/disable");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      code: "SUB_1",
      token: "tok",
    });
  });
});

describe("FlutterwaveProvider", () => {
  const HASH = "test-webhook-hash";

  it("starts a hosted checkout with the payment plan, in naira", async () => {
    const fetch = fakeFetch(
      json({
        status: "success",
        data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/x" },
      }),
    );
    const provider = new FlutterwaveProvider(SECRET, HASH, fetch);
    const result = await provider.startCheckout({
      reference: "nbe_ref2",
      email: "ada@example.test",
      name: "Ada",
      amountMinor: 150000,
      currency: "NGN",
      providerPlanId: "3807",
      callbackUrl: "http://localhost:3000/account/billing/return?provider=flutterwave",
    });
    expect(result.ok).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe("https://api.flutterwave.com/v3/payments");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      tx_ref: "nbe_ref2",
      amount: 1500,
      payment_plan: 3807,
      customer: { email: "ada@example.test" },
    });
  });

  it("verifies by reference and converts to kobo", async () => {
    const fetch = fakeFetch(
      json({ status: "success", data: { status: "successful", amount: 1500, currency: "NGN" } }),
    );
    const provider = new FlutterwaveProvider(SECRET, HASH, fetch);
    expect(await provider.verify("nbe_ref2")).toEqual({
      status: "success",
      amountMinor: 150000,
      currency: "NGN",
    });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=nbe_ref2",
    );
  });

  it("checks the verif-hash header", () => {
    const provider = new FlutterwaveProvider(SECRET, HASH, fakeFetch());
    const body = JSON.stringify({
      event: "charge.completed",
      data: {
        tx_ref: "nbe_ref2",
        status: "successful",
        amount: 1500,
        currency: "NGN",
        customer: { email: "ada@example.test" },
      },
    });
    expect(provider.parseWebhook(body, new Headers({ "verif-hash": "nope" })).ok).toBe(false);
    expect(provider.parseWebhook(body, new Headers({ "verif-hash": HASH }))).toMatchObject({
      ok: true,
      event: { type: "payment.succeeded", reference: "nbe_ref2", amountMinor: 150000 },
    });
  });

  it("finds the subscription by email before cancelling it", async () => {
    const fetch = fakeFetch(
      json({ status: "success", data: [{ id: 4147 }] }),
      json({ status: "success", data: {} }),
    );
    const provider = new FlutterwaveProvider(SECRET, HASH, fetch);
    expect(
      await provider.cancel({
        subscriptionRef: null,
        token: null,
        email: "ada@example.test",
        providerPlanId: "3807",
      }),
    ).toEqual({ ok: true });
    expect(String(fetch.mock.calls[0][0])).toContain("/subscriptions?email=ada%40example.test");
    expect(fetch.mock.calls[1][0]).toBe("https://api.flutterwave.com/v3/subscriptions/4147/cancel");
    expect(fetch.mock.calls[1][1]?.method).toBe("PUT");
  });
});

class MemoryStore implements BillingStore {
  subs = new Map<
    string,
    StoredSubscription & {
      email: string;
      checkoutReference: string | null;
      cancelAtPeriodEnd: boolean;
      graceUntil: Date | null;
      providerToken: string | null;
    }
  >();
  events = new Set<string>();

  async byCheckoutReference(_provider: string, reference: string) {
    return [...this.subs.values()].find((s) => s.checkoutReference === reference) ?? null;
  }
  async findForCustomer(_provider: string, query: CustomerQuery) {
    return (
      [...this.subs.values()].find(
        (s) =>
          s.email === query.email &&
          query.statuses.includes(s.status) &&
          (!query.subscriptionRef ||
            !s.providerSubscriptionRef ||
            s.providerSubscriptionRef === query.subscriptionRef),
      ) ?? null
    );
  }
  async activatePending(id: string, start: Date, end: Date) {
    const sub = this.subs.get(id)!;
    if (sub.status !== "pending") return false;
    Object.assign(sub, { status: "active", currentPeriodEnd: end });
    return true;
  }
  async extend(id: string, _start: Date, end: Date) {
    Object.assign(this.subs.get(id)!, {
      status: "active",
      currentPeriodEnd: end,
      graceUntil: null,
    });
  }
  async update(id: string, data: object) {
    Object.assign(this.subs.get(id)!, data);
  }
  async recordEvent(provider: string, eventId: string) {
    const key = `${provider}:${eventId}`;
    if (this.events.has(key)) return false;
    this.events.add(key);
    return true;
  }
  async forgetEvent(provider: string, eventId: string) {
    this.events.delete(`${provider}:${eventId}`);
  }
}

function setup(verified: VerifiedPayment) {
  const store = new MemoryStore();
  store.subs.set("s1", {
    id: "s1",
    email: "ada@example.test",
    status: "pending",
    checkoutReference: "nbe_ref1",
    providerSubscriptionRef: null,
    providerToken: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    graceUntil: null,
    plan: { interval: "monthly", priceMinor: 150000, currency: "NGN" },
  });
  const verify = vi.fn(async () => verified);
  const provider = { kind: "paystack", verify } as unknown as PaymentProvider;
  const processor = new BillingProcessor(
    store,
    provider,
    async () => 3,
    () => NOW,
  );
  return { store, verify, processor, sub: store.subs.get("s1")! };
}

const paid: VerifiedPayment = { status: "success", amountMinor: 150000, currency: "NGN" };

describe("BillingProcessor", () => {
  it("activates a checkout once, after verifying the payment", async () => {
    const { processor, sub } = setup(paid);
    expect(await processor.confirmCheckout("nbe_ref1")).toBe("activated");
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEnd?.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(await processor.confirmCheckout("nbe_ref1")).toBe("already_active");
    expect(await processor.confirmCheckout("other")).toBe("unknown");
  });

  it("does not activate an underpaid or unpaid checkout", async () => {
    const short = setup({ status: "success", amountMinor: 100, currency: "NGN" });
    expect(await short.processor.confirmCheckout("nbe_ref1")).toBe("failed");
    expect(short.sub.status).toBe("pending");
    const wrongCurrency = setup({ status: "success", amountMinor: 150000, currency: "USD" });
    expect(await wrongCurrency.processor.confirmCheckout("nbe_ref1")).toBe("failed");
    const pending = setup({ status: "pending" });
    expect(await pending.processor.confirmCheckout("nbe_ref1")).toBe("pending");
  });

  it("links the provider subscription, then renews once per payment reference", async () => {
    const { processor, sub } = setup(paid);
    await processor.confirmCheckout("nbe_ref1");
    await processor.handle({
      type: "subscription.created",
      subscriptionRef: "SUB_1",
      token: "tok",
      email: "ada@example.test",
      providerPlanId: "PLN_test",
    });
    expect(sub.providerSubscriptionRef).toBe("SUB_1");
    const renewal = {
      type: "payment.succeeded" as const,
      reference: "T_renewal_1",
      email: "ada@example.test",
      providerPlanId: "PLN_test",
      subscriptionRef: null,
      amountMinor: 150000,
      currency: "NGN",
    };
    await processor.handle(renewal);
    expect(sub.currentPeriodEnd?.toISOString()).toBe("2026-12-08T12:00:00.000Z");
    await processor.handle(renewal);
    expect(sub.currentPeriodEnd?.toISOString()).toBe("2026-12-08T12:00:00.000Z");
  });

  it("marks failed renewals past due with the grace period, and cancellations at period end", async () => {
    const { processor, sub } = setup(paid);
    await processor.confirmCheckout("nbe_ref1");
    await processor.handle({
      type: "payment.failed",
      subscriptionRef: null,
      email: "ada@example.test",
      providerPlanId: null,
    });
    expect(sub.status).toBe("past_due");
    expect(sub.graceUntil?.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    await processor.handle({
      type: "subscription.canceled",
      subscriptionRef: null,
      email: "ada@example.test",
      providerPlanId: null,
    });
    expect(sub.cancelAtPeriodEnd).toBe(true);
  });

  it("ignores events for unknown customers", async () => {
    const { processor, verify } = setup(paid);
    await processor.handle({
      type: "payment.succeeded",
      reference: "T_x",
      email: "nobody@example.test",
      providerPlanId: null,
      subscriptionRef: null,
      amountMinor: 1,
      currency: "NGN",
    });
    expect(verify).not.toHaveBeenCalled();
  });
});
