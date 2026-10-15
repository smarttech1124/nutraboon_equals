"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AccountFormState } from "@/app/(account)/actions";
import { Alert, Button, Field } from "@/components/ui";

export type AccountAction = (
  prev: AccountFormState,
  formData: FormData,
) => Promise<AccountFormState>;

const IDLE: AccountFormState = { status: "idle", message: "" };

function Message({ state }: { state: AccountFormState }) {
  if (state.status === "idle") return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export function SignUpForm({ action, next }: { action: AccountAction; next?: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="name" name="name" label="Your name" autoComplete="name" required />
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 10 characters. A short sentence is easy to remember."
        minLength={10}
        required
      />
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}

export function SignInForm({ action, next }: { action: AccountAction; next?: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <Link
        href="/forgot-password"
        className="text-sm text-brand-text underline underline-offset-2"
      >
        Forgot your password?
      </Link>
    </form>
  );
}

export function ForgotPasswordForm({ action }: { action: AccountAction }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ action, token }: { action: AccountAction; token: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <Message state={state} />
        <Link
          href="/sign-in"
          className="font-semibold text-brand-text underline underline-offset-2"
        >
          Log in
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters."
        minLength={10}
        required
      />
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}

/** A button, not an automatic check: link scanners in email apps must not use up the link. */
export function VerifyEmailForm({ action, token }: { action: AccountAction; token: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Message state={state} />
      {state.status !== "success" && (
        <Button type="submit" disabled={pending}>
          {pending ? "Confirming…" : "Confirm my email"}
        </Button>
      )}
    </form>
  );
}

export function ResendVerificationForm({
  action,
}: {
  action: (prev: AccountFormState) => Promise<AccountFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Message state={state} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Sending…" : "Send a new confirmation link"}
        </Button>
      </div>
    </form>
  );
}
