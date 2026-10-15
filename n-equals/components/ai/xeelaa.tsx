"use client";

import { useActionState } from "react";
import type { XeelaaView } from "@admin/lib/xeelaa-status";
import { IDLE, StatusMessage, type FormAction } from "./forms";

const secondary =
  "inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-subtle disabled:opacity-60";

/**
 * Actions for the XEELAA row of the saved configurations (ADR-052, ADR-080):
 * the Use XEELAA switch, re-check, usage and delete. A key is added or
 * replaced through Add an API key.
 */
export function XeelaaRowActions({ view, action }: { view: XeelaaView; action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const canEnable = view.configured && view.status === "verified";

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="intent" value={view.enabled ? "disable" : "enable"} />
        <button
          type="submit"
          role="switch"
          aria-checked={view.enabled}
          disabled={pending || (!view.enabled && !canEnable)}
          className="flex items-center gap-2 rounded-full text-sm disabled:opacity-60"
        >
          <span className="font-medium">Use XEELAA API</span>
          <span
            aria-hidden="true"
            className={`relative inline-block h-6 w-10 rounded-full transition ${
              view.enabled ? "bg-brand" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${
                view.enabled ? "left-[1.125rem]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </form>
      <form
        action={formAction}
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (
            submitter?.value === "remove" &&
            !window.confirm(
              "Delete the stored XEELAA key? Chat will use the active configuration. Also revoke it in your XEELAA dashboard.",
            )
          ) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap gap-2"
      >
        <button
          type="submit"
          name="intent"
          value="recheck"
          disabled={pending}
          className={secondary}
        >
          Re-check
        </button>
        <button type="submit" name="intent" value="usage" disabled={pending} className={secondary}>
          Show usage
        </button>
        <button type="submit" name="intent" value="remove" disabled={pending} className={secondary}>
          Delete key
        </button>
      </form>
      <StatusMessage state={state} />
      {state.usage && state.usage.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-line p-3 text-sm">
          {state.usage.map((item) => (
            <div key={item.label} className="flex justify-between gap-3">
              <dt className="text-muted capitalize">{item.label}</dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
