import { DemoSignProvider } from "./demo-provider";
import { ProductionSignProvider } from "./production-provider";
import type { SignLanguageResponseProvider } from "./types";

export type SignProviderSetting = "demo" | "production" | "off";

/**
 * The active sign-language provider, from SIGN_LANGUAGE_PROVIDER (ADR-077):
 * "demo" (the default until a real provider is integrated), "production"
 * (the reserved real provider) or "off". Server-only.
 */
export function signProviderSetting(
  env: Record<string, string | undefined> = process.env,
): SignProviderSetting {
  const value = env.SIGN_LANGUAGE_PROVIDER?.trim().toLowerCase();
  return value === "production" || value === "off" ? value : "demo";
}

export function getSignProvider(
  env: Record<string, string | undefined> = process.env,
): SignLanguageResponseProvider | null {
  switch (signProviderSetting(env)) {
    case "off":
      return null;
    case "production":
      return new ProductionSignProvider();
    default:
      return new DemoSignProvider();
  }
}
