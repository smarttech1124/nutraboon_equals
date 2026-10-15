"use client";

import { useActionState } from "react";
import type { ProfileState } from "@/app/(account)/account/profile/actions";
import { Alert, Button, Field } from "@/components/ui";

type Action = (prev: ProfileState, formData: FormData) => Promise<ProfileState>;
const IDLE: ProfileState = { status: "idle", message: "" };

function Result({ state }: { state: ProfileState }) {
  if (state.status === "idle") return null;
  return <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

/** Name (editable) and sign-in email (read-only) of the signed-in administrator. */
export function AdminNameForm({
  action,
  name,
  email,
}: {
  action: Action;
  name: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ProfileState & { seq?: number }, formData: FormData) => ({
      ...(await action(prev, formData)),
      seq: (prev.seq ?? 0) + 1,
    }),
    IDLE as ProfileState & { seq?: number },
  );
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite">
        <Result state={state} />
      </div>
      <Field
        key={`name-${state.seq ?? 0}`}
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={state.values?.name ?? name}
        error={state.fieldErrors?.name}
      />
      <Field
        id="email"
        name="email-display"
        label="Sign-in email"
        type="email"
        value={email}
        readOnly
        aria-readonly="true"
        hint="Ask a super administrator if this needs to change."
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

export function SignOutOthersForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div aria-live="polite">
        <Result state={state} />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Signing out…" : "Sign out of other sessions"}
        </Button>
      </div>
    </form>
  );
}
