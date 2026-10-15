"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import type { SignInState } from "./actions";

const IDLE: SignInState = { status: "idle", message: "" };

export function AdminSignInForm({
  action,
}: {
  action: (prev: SignInState, formData: FormData) => Promise<SignInState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="email" name="email" type="email" label="Email" autoComplete="username" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
