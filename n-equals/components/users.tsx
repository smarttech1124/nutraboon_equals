"use client";

import { useActionState } from "react";
import type { AddAdminState } from "@admin/app/(portal)/admins/actions";
import type { ActionState } from "@admin/lib/access";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { ADMIN_ROLES, ROLE_LABEL, type AdminRole } from "@/lib/auth/permissions";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const IDLE: ActionState = { status: "idle", message: "" };

function Message({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export function StatusToggle({
  action,
  userId,
  name,
  suspended,
}: {
  action: Action;
  userId: string;
  name: string;
  suspended: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!suspended && !window.confirm(`Suspend ${name}? They are signed out everywhere.`)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
      <Button
        type="submit"
        variant={suspended ? "secondary" : "danger"}
        disabled={pending}
        aria-label={`${suspended ? "Reactivate" : "Suspend"} ${name}`}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function RoleEditor({
  action,
  userId,
  name,
  roles,
}: {
  action: Action;
  userId: string;
  name: string;
  roles: AdminRole[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const missing = ADMIN_ROLES.filter((role) => !roles.includes(role));
  return (
    <div className="flex flex-col gap-2">
      {roles.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`Admin roles of ${name}`}>
          {roles.map((role) => (
            <li key={role}>
              <form action={formAction}>
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="grant" value="false" />
                <button
                  type="submit"
                  disabled={pending}
                  aria-label={`Remove ${ROLE_LABEL[role]} from ${name}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text hover:bg-danger-soft hover:text-danger"
                >
                  {ROLE_LABEL[role]} <span aria-hidden="true">×</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="grant" value="true" />
          <label className="sr-only" htmlFor={`role-${userId}`}>
            Role to add for {name}
          </label>
          <select
            id={`role-${userId}`}
            name="role"
            className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            {missing.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={pending}>
            Add role
          </Button>
        </form>
      )}
      <Message state={state} />
    </div>
  );
}

/** Permanent deletion; asks first and names the account in the question. */
export function DeleteUserButton({
  action,
  userId,
  name,
  email,
}: {
  action: Action;
  userId: string;
  name: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete ${name} (${email}) permanently? Their meal plans, subscriptions, appointments and sign-ins are deleted too. This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="danger" disabled={pending} aria-label={`Delete ${name}`}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <Message state={state} />
    </form>
  );
}

type AddAdminAction = (prev: AddAdminState, formData: FormData) => Promise<AddAdminState>;

/**
 * Adds an administrator by email. A new email also needs a name and a
 * temporary password. The password field is never echoed back.
 */
export function AddAdminForm({ action }: { action: AddAdminAction }) {
  // React resets the form after each submit; the seq key remounts the fields
  // with the submitted values so an error does not wipe what was typed.
  const [state, formAction, pending] = useActionState(
    async (prev: AddAdminState & { seq?: number }, formData: FormData) => ({
      ...(await action(prev, formData)),
      seq: (prev.seq ?? 0) + 1,
    }),
    IDLE as AddAdminState & { seq?: number },
  );
  const keep = state.status === "error" ? state.values : undefined;
  return (
    <form
      key={state.seq ?? 0}
      action={formAction}
      className="grid gap-4 sm:grid-cols-2"
      autoComplete="off"
      noValidate
    >
      <Field
        id="admin-email"
        name="email"
        type="email"
        label="Email"
        required
        defaultValue={keep?.email}
        error={state.fieldErrors?.email}
        hint="An existing account keeps its password and gets the role."
      />
      <SelectField id="admin-role" name="role" label="Role" defaultValue={keep?.role}>
        {ADMIN_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </SelectField>
      <Field
        id="admin-name"
        name="name"
        label="Name (new accounts only)"
        maxLength={100}
        defaultValue={keep?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        id="admin-password"
        name="password"
        type="password"
        label="Temporary password (new accounts only)"
        autoComplete="new-password"
        minLength={10}
        error={state.fieldErrors?.password}
        hint="At least 10 characters. Ask them to change it under My profile."
      />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Message state={state} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add administrator"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Resets another administrator's password (ADR-091). The acting administrator
 * confirms with their own password; the target gets a reset link by email.
 * React clears the fields after each submit, so the password is never kept.
 */
export function ResetAdminPasswordForm({
  action,
  admins,
}: {
  action: Action;
  admins: { id: string; name: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      className="grid gap-4 sm:grid-cols-2"
      autoComplete="off"
      onSubmit={(event) => {
        const select = event.currentTarget.elements.namedItem("userId") as HTMLSelectElement;
        const name = select.selectedOptions[0]?.text ?? "this administrator";
        if (
          !window.confirm(
            `Reset the password of ${name}? Their current password stops working and they are signed out everywhere until they use the emailed link.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <SelectField id="reset-admin" name="userId" label="Administrator">
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.email})
          </option>
        ))}
      </SelectField>
      <Field
        id="reset-confirm-password"
        name="password"
        type="password"
        label="Your password"
        autoComplete="current-password"
        required
        hint="Confirms it is you making this change."
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Message state={state} />
        <div>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </Button>
        </div>
      </div>
    </form>
  );
}
