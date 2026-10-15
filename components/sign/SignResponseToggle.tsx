"use client";

import { useSettings } from "@/components/chat/useSettings";

/**
 * The "Sign language response" choice (ADR-077), the same setting in every
 * module that shows replies. Saved on this device with the other chat
 * settings.
 */
export function SignResponseToggle({ id }: { id: string }) {
  const { settings, update } = useSettings();
  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm text-ink has-checked:border-brand has-checked:bg-brand-soft"
    >
      <input
        id={id}
        type="checkbox"
        checked={settings.signLanguage}
        onChange={(e) => update({ signLanguage: e.target.checked })}
        className="size-4 accent-[var(--brand-text)]"
      />
      Sign language response <span className="text-muted">(demo)</span>
    </label>
  );
}

/** Whether replies should come with a sign-language response on this device. */
export function useSignLanguageResponses(): boolean {
  return useSettings().settings.signLanguage;
}
