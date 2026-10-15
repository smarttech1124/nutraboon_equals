import { PROVIDERS } from "@/lib/ai/settings/providers";
import { getAISettings, getXeelaa } from "@/lib/ai/settings/runtime";

/** The organisation behind each AI service, as users would recognise it. */
const COMPANY: Record<string, string> = {
  gemini: "Google (Gemini)",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  xeelaa: "XEELAA",
};

/**
 * The AI services that currently receive chat messages, for the privacy
 * notice (ADR-053). Read at request time, so the notice follows the admin's
 * settings (ADR-047, ADR-052). Never reads or decrypts a key.
 */
export async function currentAIServices(
  env: Record<string, string | undefined> = process.env,
): Promise<string[]> {
  const envService =
    (env.AI_PROVIDER ?? "gemini").toLowerCase() === "mock" ? undefined : COMPANY.gemini;
  const settings = getAISettings(env);
  if (!settings.ok) return envService ? [envService] : [];

  const services: string[] = [];
  try {
    const xeelaa = getXeelaa();
    if (xeelaa.ok && (await xeelaa.service.view()).active) services.push(COMPANY.xeelaa);
    const active = (await settings.service.list()).find((c) => c.isActive);
    if (active) services.push(COMPANY[active.provider] ?? PROVIDERS[active.provider].label);
    else if (envService) services.push(envService);
  } catch {
    // Settings unreadable: chat falls back to the environment settings too.
    return envService ? [envService] : [];
  }
  return services;
}
