"use client";

import { useActionState, useEffect, useOptimistic, useRef } from "react";
import type { PlanActionState, TurnState } from "@/app/planner/actions";
import { SignLanguageResponseSlot } from "@/components/sign/SignLanguageResponse";
import { SignResponseToggle, useSignLanguageResponses } from "@/components/sign/SignResponseToggle";
import { Alert, Button, SelectField } from "@/components/ui";

type TurnAction = (prev: TurnState, formData: FormData) => Promise<TurnState>;
type CreateAction = (prev: PlanActionState, formData: FormData) => Promise<PlanActionState>;

/**
 * The Meal Planner's two-way intake (ADR-066): a short conversation, then a
 * summary and the plan lengths this account may choose.
 */
export function PlannerConversation({
  initial,
  turnAction,
  createAction,
  durations,
  limitNote,
}: {
  initial: TurnState;
  turnAction: TurnAction;
  createAction: CreateAction;
  durations: { days: number; label: string }[];
  limitNote: string;
}) {
  const [state, sendAction, sending] = useActionState(turnAction, initial);
  // The user's message shows at once, before the planner replies.
  const [messages, addMessage] = useOptimistic(state.messages, (current, text: string) => [
    ...current,
    { role: "user" as const, content: text },
  ]);
  const [created, createFormAction, creating] = useActionState(createAction, {
    status: "idle",
    message: "",
  } as PlanActionState);
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const signLanguage = useSignLanguageResponses();
  const latestReply = messages.findLastIndex((m) => m.role !== "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    if (!sending) inputRef.current?.focus();
  }, [messages.length, sending]);

  const done = state.status === "blocked";
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Planning conversation" aria-live="polite" className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <li
            key={i}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap ${
                m.role === "user"
                  ? "rounded-br-sm bg-brand text-white"
                  : "rounded-bl-sm bg-subtle text-ink"
              }`}
            >
              <span className="sr-only">{m.role === "user" ? "You said: " : "Planner said: "}</span>
              {m.content}
            </p>
            {signLanguage && m.role !== "user" && m.content.trim() && (
              <SignLanguageResponseSlot
                text={m.content}
                module="planner"
                latest={i === latestReply}
              />
            )}
          </li>
        ))}
        {sending && (
          <li className="text-sm text-muted" role="status">
            Planner is thinking…
          </li>
        )}
        <li ref={endRef} aria-hidden="true" />
      </ol>
      {state.urgentNotice && <Alert tone="error">{state.urgentNotice}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {state.status === "ready" && (
        <form
          action={createFormAction}
          className="flex flex-col gap-3 rounded-xl border border-line p-4"
        >
          <p className="font-semibold text-ink">Ready to create your plan</p>
          <SelectField
            id="durationDays"
            name="durationDays"
            label="How long should the plan be?"
            defaultValue={String(durations.at(-1)?.days ?? 1)}
          >
            {durations.map((d) => (
              <option key={d.days} value={d.days}>
                {d.label}
              </option>
            ))}
          </SelectField>
          <p className="text-sm text-muted">{limitNote}</p>
          {created.status === "error" && <Alert tone="error">{created.message}</Alert>}
          <div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating your plan… this can take a minute" : "Create my plan"}
            </Button>
          </div>
          {creating && (
            <p role="status" className="text-sm text-muted">
              Writing meals, checking them against your allergies and safety rules, and working out
              nutrition and shopping.
            </p>
          )}
        </form>
      )}

      {!done && (
        <form
          action={(formData) => {
            const text = formData.get("message");
            if (typeof text === "string" && text.trim()) addMessage(text.trim());
            sendAction(formData);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="message" className="sr-only">
            Your answer
          </label>
          <textarea
            ref={inputRef}
            id="message"
            name="message"
            rows={2}
            maxLength={1000}
            required
            disabled={sending || creating}
            placeholder={
              state.status === "ready"
                ? "Anything to change before you create the plan?"
                : "Type your answer…"
            }
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant={state.status === "ready" ? "secondary" : "primary"}
              disabled={sending || creating}
            >
              Send
            </Button>
            <SignResponseToggle id="planner-sign-response" />
          </div>
        </form>
      )}
    </div>
  );
}
