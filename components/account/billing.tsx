"use client";

import { useActionState } from "react";
import type { AccountFormState } from "@/app/(account)/actions";
import { Alert, Button } from "@/components/ui";
import type { AccountAction } from "./forms";

const IDLE: AccountFormState = { status: "idle", message: "" };

function Message({ state }: { state: AccountFormState }) {
  if (state.status === "idle") return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export type CheckoutOption = { provider: "paystack" | "flutterwave"; label: string };

export function CheckoutForm({
  action,
  planId,
  planName,
  options,
}: {
  action: AccountAction;
  planId: string;
  planName: string;
  options: CheckoutOption[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.provider}
            type="submit"
            name="provider"
            value={option.provider}
            variant="secondary"
            disabled={pending}
            aria-label={`Subscribe to ${planName} with ${option.label}`}
          >
            Pay with {option.label}
          </Button>
        ))}
      </div>
      <Message state={state} />
    </form>
  );
}

export function CancelRenewalForm({
  action,
  subscriptionId,
}: {
  action: AccountAction;
  subscriptionId: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  if (state.status === "success") return <Message state={state} />;
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm("Stop renewing this plan? It stays active until the paid period ends.")
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div>
        <Button type="submit" variant="ghost" disabled={pending}>
          Stop renewal
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}
