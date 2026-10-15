"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ProfileState } from "@/app/(account)/account/profile/actions";
import { Alert, Button, CheckboxGroup, Field } from "@/components/ui";

type Action = (prev: ProfileState, formData: FormData) => Promise<ProfileState>;
const IDLE: ProfileState = { status: "idle", message: "" };

/** Moves focus to the result so keyboard and screen reader users hear it (WCAG 3.3.1). */
function useFocusResult(state: ProfileState) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "idle") return;
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [state]);
  return ref;
}

export function ProfileForm({
  action,
  name,
  email,
  needs,
  needOptions,
}: {
  action: Action;
  name: string;
  email: string;
  needs: string[];
  needOptions: { value: string; label: string }[];
}) {
  // React resets a form after each submit; remounting the fields with the
  // submitted values (seq changes every time) keeps what the person entered.
  const [state, formAction, pending] = useActionState(
    async (prev: ProfileState & { seq?: number }, formData: FormData) => ({
      ...(await action(prev, formData)),
      seq: (prev.seq ?? 0) + 1,
    }),
    IDLE as ProfileState & { seq?: number },
  );
  const result = useFocusResult(state);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div ref={result} tabIndex={-1} className="outline-none">
        {state.status !== "idle" && (
          <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
        )}
      </div>
      <Field
        key={`name-${state.seq ?? 0}`}
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        defaultValue={state.values?.name ?? name}
        required
        maxLength={100}
        error={state.fieldErrors?.name}
      />
      <Field
        id="email"
        name="email-display"
        label="Email"
        type="email"
        value={email}
        readOnly
        aria-readonly="true"
        hint="Your sign-in email. To change it, contact support."
      />
      <CheckboxGroup
        key={`needs-${state.seq ?? 0}`}
        legend="Access needs to share when you book (optional)"
        hint="We tick these for you on hospital bookings. You can change them for each booking."
        name="needs"
        options={needOptions}
        selected={state.values?.needs ?? needs}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const result = useFocusResult(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <div ref={result} tabIndex={-1} className="outline-none">
        {state.status !== "idle" && (
          <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
        )}
      </div>
      <Field
        id="currentPassword"
        name="currentPassword"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
      />
      <Field
        id="newPassword"
        name="newPassword"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters."
        minLength={10}
        required
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Repeat the new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
