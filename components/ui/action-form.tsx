"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";

/** The result a form action returns; shown under the form. */
export type ActionState = { status: "idle" | "success" | "error"; message: string };

const IDLE: ActionState = { status: "idle", message: "" };

/**
 * A form posting to a server action, with its result shown below the fields.
 * Fields are passed as children, so pages can render them on the server.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  confirm,
  className = "flex flex-col gap-4",
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** A question to confirm before submitting. */
  confirm?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      {state.status !== "idle" && (
        <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      )}
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
