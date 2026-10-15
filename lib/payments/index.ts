import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { FlutterwaveProvider } from "./flutterwave";
import { PaystackProvider } from "./paystack";
import { BillingProcessor } from "./processor";
import { PrismaBillingStore } from "./store";
import type { PaymentProvider, ProviderKind } from "./types";

/**
 * Payment providers configured by environment variables (ADR-063). Only
 * test-mode keys belong in development; a provider without its keys is
 * simply not offered.
 */
export function getPaymentProvider(kind: ProviderKind): PaymentProvider | null {
  if (kind === "paystack") {
    const key = process.env.PAYSTACK_SECRET_KEY;
    return key ? new PaystackProvider(key) : null;
  }
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  const hash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  return key && hash ? new FlutterwaveProvider(key, hash) : null;
}

export function configuredProviders(): ProviderKind[] {
  return (["paystack", "flutterwave"] as const).filter((kind) => getPaymentProvider(kind) !== null);
}

export function getBillingProcessor(provider: PaymentProvider): BillingProcessor {
  return new BillingProcessor(new PrismaBillingStore(getPrisma()), provider, () =>
    getEntitlementService().graceDays(),
  );
}
