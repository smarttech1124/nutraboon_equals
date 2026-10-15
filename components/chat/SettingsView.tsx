"use client";

import { isEnglish, LANGUAGES, type LanguageCode } from "@/lib/i18n/languages";
import type { UserSettings } from "./useSettings";

/** The user's own settings, shown inside the chat dialog (ADR-050). */
export function SettingsView({
  settings,
  onChange,
  onDone,
  canReadAloud,
  canListen,
}: {
  settings: UserSettings;
  onChange: (patch: Partial<UserSettings>) => void;
  onDone: () => void;
  /** Whether this device can read replies aloud in the chosen language. */
  canReadAloud: boolean;
  /** Whether this browser has speech recognition. */
  canListen?: boolean;
}) {
  const current = LANGUAGES.find((l) => l.code === settings.language);

  return (
    <section aria-labelledby="settings-title" className="space-y-4">
      <h3 id="settings-title" className="text-lg font-semibold text-ink">
        Settings
      </h3>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-ink">Response language</legend>
        {LANGUAGES.map((lang) => (
          <label
            key={lang.code}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 has-checked:border-brand has-checked:bg-brand-soft"
          >
            <input
              type="radio"
              name="language"
              value={lang.code}
              checked={settings.language === lang.code}
              onChange={() => onChange({ language: lang.code as LanguageCode })}
              className="size-4 accent-[var(--brand-text)]"
            />
            <span className="text-ink">{lang.label}</span>
            {lang.beta && (
              <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">
                Beta
              </span>
            )}
          </label>
        ))}
      </fieldset>

      {current?.beta && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink">
          {current.label} replies are translated by AI and not yet checked by native speakers.
          Safety and allergy notes stay in English so nothing important is lost.
        </p>
      )}
      <p className="text-sm text-muted">
        {canReadAloud
          ? "Replies can be read aloud in this language on this device."
          : "This device has no voice for this language, so replies won't be read aloud."}{" "}
        Your choice is saved on this device only.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-ink">Response format</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 has-checked:border-brand has-checked:bg-brand-soft">
          <input
            type="checkbox"
            checked={settings.signLanguage}
            onChange={(e) => onChange({ signLanguage: e.target.checked })}
            className="mt-1 size-4 accent-[var(--brand-text)]"
          />
          <span className="text-ink">
            Sign language response (demo)
            <span className="block text-sm text-muted">
              Shows a sample sign-language video with each reply. It is a demonstration only and
              does not translate the reply. The text reply always stays. Also applies to the Meal
              Planner and hospital messages on this device.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-ink">Voice messages</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 has-checked:border-brand has-checked:bg-brand-soft">
          <input
            type="checkbox"
            checked={settings.voiceConfirm}
            onChange={(e) => onChange({ voiceConfirm: e.target.checked })}
            className="mt-1 size-4 accent-[var(--brand-text)]"
          />
          <span className="text-ink">
            Read my voice message back, then let me say “send”
            <span className="block text-sm text-muted">
              For blind and low-vision users. You hear what was understood before anything is sent.
            </span>
          </span>
        </label>
        {settings.voiceConfirm && !(canListen && canReadAloud && isEnglish(settings.language)) && (
          <p className="text-sm text-muted">
            {isEnglish(settings.language)
              ? "This device can't both listen and read aloud, so this option has no effect here."
              : "Spoken confirmation works in English for now; in this language, check the text and press Send."}
          </p>
        )}
      </fieldset>

      <button
        type="button"
        onClick={onDone}
        className="h-11 rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
      >
        Back to chat
      </button>
    </section>
  );
}
