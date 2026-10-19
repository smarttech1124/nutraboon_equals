import { getAISettings } from "@/lib/ai/settings/runtime";
import { envKey, type KeyLookup } from "./index";

/**
 * Where speech providers get their keys (ADR-090): the environment variable,
 * else the AI key saved and activated in n-equals when it is for the same
 * provider. Decrypted keys stay inside the built provider.
 */
export const speechKeyFor: KeyLookup = async (provider) => {
  const fromEnv = envKey(provider);
  if (fromEnv) return fromEnv;
  const settings = getAISettings();
  if (!settings.ok) return null;
  const active = await settings.service.getActiveCredential();
  return active && active.provider === provider ? active.apiKey : null;
};
