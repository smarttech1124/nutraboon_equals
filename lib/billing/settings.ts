import { z } from "zod";
import { parseEntitlements, type Entitlements } from "./entitlements";

/**
 * Non-secret platform settings that administrators edit in n-equals
 * (PlatformSetting rows, ADR-062). Each has a schema and a default, so a
 * missing or malformed row never breaks the app: it falls back to the default.
 */

/** Modules that are switched on and off without a deploy. Off until built and approved. */
export const FEATURE_FLAGS = {
  mealPlanner: { label: "Meal Planner", description: "The standalone Meal Planner page." },
  payments: {
    label: "Paid plans",
    description: "Checkout with Paystack or Flutterwave on the account page.",
  },
  nutritionists: {
    label: "Nutritionists",
    description: "Nutritionist onboarding and marketplace.",
  },
  vendors: { label: "Vendors", description: "Vendor onboarding and product recommendations." },
  hospitals: { label: "Hospitals", description: "Hospital discovery and appointments." },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export type FeatureFlags = Record<FeatureFlag, boolean>;
export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

export const SETTING_KEYS = {
  freeEntitlements: "billing.freeEntitlements",
  graceDays: "billing.graceDays",
  features: "features",
  hospitalRadiusKm: "hospitals.defaultRadiusKm",
  audio: "audio.providers",
} as const;

/** The radius hospital search starts with, in km (ADR-068). */
export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 200;

export function parseRadiusKm(value: unknown): number {
  const parsed = z.number().int().min(1).max(MAX_RADIUS_KM).safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RADIUS_KM;
}

/**
 * Speech providers (ADR-069). Only the browser is available today; N-ATLaS
 * is registered so it can be switched on once a server for it exists.
 */
export const SPEECH_TO_TEXT_PROVIDERS = {
  browser: { label: "Browser speech recognition", available: true },
  "n-atlas": { label: "N-ATLaS (Awarri), self-hosted", available: false },
} as const;
export const TEXT_TO_SPEECH_PROVIDERS = {
  browser: { label: "Browser speech synthesis", available: true },
} as const;

export type AudioSettings = {
  speechToText: keyof typeof SPEECH_TO_TEXT_PROVIDERS;
  textToSpeech: keyof typeof TEXT_TO_SPEECH_PROVIDERS;
};

/** Falls back to the browser for anything unknown or not available. */
export function parseAudioSettings(value: unknown): AudioSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const stt =
    typeof v.speechToText === "string" && v.speechToText in SPEECH_TO_TEXT_PROVIDERS
      ? (v.speechToText as AudioSettings["speechToText"])
      : "browser";
  return {
    speechToText: SPEECH_TO_TEXT_PROVIDERS[stt].available ? stt : "browser",
    textToSpeech: "browser",
  };
}

export const DEFAULT_GRACE_DAYS = 3;
export const MAX_GRACE_DAYS = 30;

export function parseGraceDays(value: unknown): number {
  const parsed = z.number().int().min(0).max(MAX_GRACE_DAYS).safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GRACE_DAYS;
}

export function parseFeatureFlags(value: unknown): FeatureFlags {
  const flags = Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, false])) as FeatureFlags;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of FEATURE_FLAG_KEYS) {
      const raw = (value as Record<string, unknown>)[key];
      if (typeof raw === "boolean") flags[key] = raw;
    }
  }
  return flags;
}

export function parseFreeEntitlements(value: unknown): Partial<Entitlements> {
  return parseEntitlements(value);
}
