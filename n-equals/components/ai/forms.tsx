"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@admin/app/(portal)/ai/actions";

/** Server actions are passed in as props so these components stay testable. */
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export const IDLE: FormState = { status: "idle", message: "" };

/** The provider value that sends the Add an API key form to the XEELAA integration. */
export const XEELAA_PROVIDER = "xeelaa";

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted";
const primary =
  "inline-flex min-h-10 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong disabled:opacity-60";
const secondary =
  "inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-subtle disabled:opacity-60";

export function StatusMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-sm ${
        state.status === "error" ? "bg-danger-soft text-danger" : "bg-brand-soft text-ink"
      }`}
    >
      {state.message}
    </p>
  );
}

export type ProviderOption = {
  value: string;
  label: string;
  modelSuggestions: string[];
  keyFormatHint: string;
};

/**
 * The key field is uncontrolled and never put in React state; React resets
 * the form after the action, so the key does not stay in the page either.
 */
export function AddConfigForm({
  action,
  providers,
}: {
  action: FormAction;
  providers: ProviderOption[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [provider, setProvider] = useState(providers[0]?.value ?? "");
  const current = providers.find((p) => p.value === provider);
  // XEELAA (ADR-052) is one key with no model: it is tried first, then the active configuration.
  const xeelaa = provider === XEELAA_PROVIDER;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ai-provider" className="font-medium">
          Provider
        </label>
        <select
          id="ai-provider"
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className={input}
        >
          {providers.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {!xeelaa && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-model" className="font-medium">
            Model ID
          </label>
          <input
            id="ai-model"
            name="model"
            required
            list="ai-model-suggestions"
            placeholder={current?.modelSuggestions[0] ?? "Model ID from the provider"}
            className={input}
          />
          <datalist id="ai-model-suggestions">
            {current?.modelSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      )}
      {!xeelaa && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-label" className="font-medium">
            Name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="ai-label" name="label" maxLength={60} className={input} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ai-key" className="font-medium">
          API key
        </label>
        <input
          id="ai-key"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          aria-describedby="ai-key-hint"
          placeholder={xeelaa ? "xla_<key id>:<secret>" : undefined}
          className={input}
        />
        <p id="ai-key-hint" className="text-sm text-muted">
          Expected: {current?.keyFormatHint}. It is checked with the provider, encrypted, and never
          shown again.
        </p>
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="activate" className="size-4" />
        {xeelaa
          ? "Use XEELAA for chat as soon as it is verified (the active configuration stays as the fallback)"
          : "Use this configuration for chat as soon as it is verified"}
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <StatusMessage state={state} />
        <div>
          <button type="submit" disabled={pending} className={primary}>
            {pending ? "Verifying with the provider…" : "Verify and save"}
          </button>
        </div>
      </div>
    </form>
  );
}

export type ConfigRowState = {
  id: string;
  name: string;
  status: "verified" | "failed" | "revoked";
  isActive: boolean;
  model: string;
};

/** Per-row actions. Revoking asks for confirmation because it cannot be undone. */
export function ConfigActions({ action, config }: { action: FormAction; config: ConfigRowState }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [editing, setEditing] = useState(false);
  if (config.status === "revoked") return <span className="text-sm text-muted">None</span>;

  const button = (intent: string, label: string, accessibleLabel: string) => (
    <button
      type="submit"
      name="intent"
      value={intent}
      disabled={pending}
      aria-label={accessibleLabel}
      className={secondary}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (
            submitter?.value === "revoke" &&
            !window.confirm(
              `Delete the stored key for ${config.name}? This cannot be undone. To stop the key working everywhere, also revoke it in the provider's dashboard.`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap gap-2"
      >
        <input type="hidden" name="id" value={config.id} />
        {config.isActive
          ? button("deactivate", "Deactivate", `Deactivate ${config.name}`)
          : config.status === "verified" &&
            button("activate", "Activate", `Activate ${config.name}`)}
        {button("reverify", "Re-check", `Re-check ${config.name}`)}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={`Change model for ${config.name}`}
          className={secondary}
        >
          Change model
        </button>
        {button("revoke", "Delete key", `Delete key for ${config.name}`)}
      </form>
      {editing && (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={config.id} />
          <input type="hidden" name="intent" value="changeModel" />
          <label className="flex flex-col gap-1 text-sm">
            New model ID
            <input name="model" required defaultValue={config.model} className={input} />
          </label>
          <button type="submit" disabled={pending} className={secondary}>
            {pending ? "Checking…" : "Verify and change"}
          </button>
        </form>
      )}
      <StatusMessage state={state} />
    </div>
  );
}
