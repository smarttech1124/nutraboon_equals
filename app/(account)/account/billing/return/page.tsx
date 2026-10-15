import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { getBillingProcessor, getPaymentProvider } from "@/lib/payments";
import type { ConfirmResult } from "@/lib/payments/processor";
import { ownerOf } from "@/lib/vendors/ownership";

export const metadata: Metadata = { title: "Payment" };

const MESSAGES: Record<ConfirmResult, { tone: "success" | "info" | "error"; text: string }> = {
  activated: { tone: "success", text: "Payment received. Your plan is active." },
  already_active: { tone: "success", text: "Your plan is active." },
  pending: {
    tone: "info",
    text: "Your payment is still being processed. Your plan starts as soon as it is confirmed.",
  },
  failed: { tone: "error", text: "The payment did not go through. Nothing was activated." },
  unknown: { tone: "error", text: "We could not find this payment." },
};

/**
 * Where Paystack (?reference=) and Flutterwave (?tx_ref=) send the subscriber
 * back. The payment is verified with the provider's API here; the query
 * string's own status is never trusted (ADR-063).
 */
export default async function BillingReturnPage({
  searchParams,
}: PageProps<"/account/billing/return">) {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account");
  const params = await searchParams;
  const kind = params.provider;
  const reference = [params.reference, params.tx_ref].find(
    (value): value is string => typeof value === "string" && value.length <= 100,
  );
  const provider = kind === "paystack" || kind === "flutterwave" ? getPaymentProvider(kind) : null;

  let result: ConfirmResult = "unknown";
  if (provider && reference) {
    // Only the subscriber's own checkout can be confirmed from their session.
    const owned = await getPrisma().subscription.findFirst({
      where: {
        checkoutReference: reference,
        provider: provider.kind,
        OR: [{ userId: user.id }, { organization: ownerOf(user.id) }],
      },
      select: { id: true },
    });
    if (owned) {
      try {
        result = await getBillingProcessor(provider).confirmCheckout(reference);
      } catch {
        result = "pending";
      }
    }
  }
  const message = MESSAGES[result];
  return (
    <Card title="Payment">
      <div className="flex flex-col gap-4">
        <Alert tone={message.tone}>{message.text}</Alert>
        <Link
          href="/account"
          className="font-semibold text-brand-text underline underline-offset-2"
        >
          Back to your account
        </Link>
      </div>
    </Card>
  );
}
