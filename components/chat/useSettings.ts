"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";

/**
 * Settings a user chooses for their own device (ADR-050). There are no
 * accounts (ADR-011), so they live in this browser only and are sent with
 * each chat request. Storage can be unavailable (private mode, blocked
 * site data); the app then uses the defaults for this visit.
 */
export type UserSettings = {
  language: LanguageCode;
  /** Read a voice message back and accept a spoken "send" (ADR-057). Off by default. */
  voiceConfirm: boolean;
  /**
   * Show a sign-language video with replies (ADR-077). Shared by the
   * assistant, the Meal Planner and hospital messages. Off by default.
   */
  signLanguage: boolean;
};

export const SETTINGS_KEY = "nbe:settings";
export const DEFAULT_SETTINGS: UserSettings = {
  language: DEFAULT_LANGUAGE,
  voiceConfirm: false,
  signLanguage: false,
};

/** Used when storage cannot be written, so a choice still applies for this visit. */
let unsaved: string | null = null;
const listeners = new Set<() => void>();

function rawSettings(): string | null {
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

export function parseSettings(raw: string | null): UserSettings {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<UserSettings>) : {};
    return {
      language: isLanguageCode(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
      voiceConfirm: parsed.voiceConfirm === true,
      signLanguage: parsed.signLanguage === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeSettings(settings: UserSettings): void {
  const raw = JSON.stringify(settings);
  try {
    window.localStorage.setItem(SETTINGS_KEY, raw);
    unsaved = null;
  } catch {
    unsaved = raw; // not saved; applies until the page is closed
  }
  listeners.forEach((l) => l());
}

export function useSettings() {
  // The server render (and first client render) uses the defaults.
  const raw = useSyncExternalStore(subscribe, rawSettings, () => null);
  const settings = useMemo(() => parseSettings(raw), [raw]);
  const update = useCallback(
    (patch: Partial<UserSettings>) => writeSettings({ ...parseSettings(rawSettings()), ...patch }),
    [],
  );
  return { settings, update };
}
