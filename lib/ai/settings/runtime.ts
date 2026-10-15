import { FallbackProvider, type CooldownState } from "../fallback";
import { getAIProvider } from "../index";
import type { AIProvider } from "../types";
import { getPrisma } from "@/lib/db";
import { fetchXeelaaUsage, verifyXeelaaKey, XeelaaProvider } from "@/lib/xeelaa/client";
import { PrismaXeelaaRepository, XeelaaService } from "@/lib/xeelaa/service";
import { ActiveProviderResolver } from "./active";
import { createCredentialCipher, CredentialKeyError, parseMasterKey } from "./crypto";
import { createProvider, verifyCredential } from "./providers";
import { PrismaAISettingsRepository } from "./repository";
import { AISettingsService } from "./service";

export type AISettingsAvailability =
  { ok: true; service: AISettingsService } | { ok: false; missing: string[] };

/**
 * Shared through globalThis: route handlers and the settings page's server
 * actions can be bundled separately, and both must see the same cache.
 */
const shared = globalThis as unknown as {
  aiSettings?: AISettingsService;
  aiResolver?: ActiveProviderResolver;
  xeelaa?: XeelaaService;
  /** The XEELAA key chat should use (null = off), cached like the active config. */
  xeelaaKey?: { value: string | null; expiresAt: number };
  xeelaaCooldown?: CooldownState;
  /** Which load of this module built the cached services (development only). */
  runtimeModule?: object;
};

// In development, hot reload replaces this module but globalThis survives, so
// cached services would keep calling the old code (e.g. an old key check).
// Drop them when a new copy of the module loads. Production never reloads.
const thisModule = {};
if (process.env.NODE_ENV !== "production" && shared.runtimeModule !== thisModule) {
  shared.aiSettings = undefined;
  shared.aiResolver = undefined;
  shared.xeelaa = undefined;
  shared.xeelaaKey = undefined;
  shared.runtimeModule = thisModule;
}

/** How long an instance trusts its view of the XEELAA switch (as ACTIVE_CACHE_MS). */
const XEELAA_CACHE_MS = 30_000;

export type XeelaaAvailability =
  { ok: true; service: XeelaaService } | { ok: false; missing: string[] };

/** The settings service, or which environment variables it still needs. */
export function getAISettings(
  env: Record<string, string | undefined> = process.env,
): AISettingsAvailability {
  if (shared.aiSettings) return { ok: true, service: shared.aiSettings };
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  let masterKey: Buffer | undefined;
  try {
    masterKey = parseMasterKey(env.AI_CREDENTIALS_KEY);
  } catch (error) {
    if (!(error instanceof CredentialKeyError)) throw error;
    missing.push("AI_CREDENTIALS_KEY");
  }
  if (missing.length > 0 || !masterKey) return { ok: false, missing };

  const cipher = createCredentialCipher(masterKey);
  const repo = PrismaAISettingsRepository.create(getPrisma());
  shared.aiSettings = new AISettingsService({
    repo,
    cipher,
    verify: (provider, apiKey, model) => verifyCredential(provider, apiKey, model),
    onActiveChanged: () => shared.aiResolver?.invalidate(),
  });
  shared.xeelaa = new XeelaaService({
    repo: new PrismaXeelaaRepository(getPrisma()),
    cipher,
    verify: (key) => verifyXeelaaKey(key),
    usage: (key) => fetchXeelaaUsage(key),
    audit: (event) => repo.addAudit(event),
    onChanged: () => (shared.xeelaaKey = undefined),
  });
  return { ok: true, service: shared.aiSettings };
}

/** The XEELAA integration service (ADR-052); needs the same settings as saved keys. */
export function getXeelaa(): XeelaaAvailability {
  const settings = getAISettings();
  if (!settings.ok) return settings;
  return { ok: true, service: shared.xeelaa! };
}

async function activeXeelaaKey(service: XeelaaService): Promise<string | null> {
  const now = Date.now();
  if (shared.xeelaaKey && now < shared.xeelaaKey.expiresAt) return shared.xeelaaKey.value;
  let value: string | null = null;
  try {
    value = await service.getActiveKey();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "xeelaa_config_unavailable",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  shared.xeelaaKey = { value, expiresAt: now + XEELAA_CACHE_MS };
  return value;
}

/**
 * The provider for structured back-office tasks (ADR-064): the active saved
 * configuration or the environment provider, never XEELAA, which only chats.
 */
export async function getStructuredProvider(): Promise<AIProvider> {
  const settings = getAISettings();
  if (!settings.ok) return getAIProvider();
  shared.aiResolver ??= new ActiveProviderResolver({
    loadActive: () => settings.service.getActiveCredential(),
    build: (c) => createProvider(c.provider, c.apiKey, c.model),
    fallback: () => getAIProvider(),
  });
  return shared.aiResolver.get();
}

/**
 * The provider chat should use: the active database configuration, else the
 * environment variables (ADR-047). Without a database or AI_CREDENTIALS_KEY
 * this is exactly the old behaviour.
 */
export async function getChatProvider(): Promise<AIProvider> {
  const settings = getAISettings();
  if (!settings.ok) return getAIProvider();
  shared.aiResolver ??= new ActiveProviderResolver({
    loadActive: () => settings.service.getActiveCredential(),
    build: (c) => createProvider(c.provider, c.apiKey, c.model),
    fallback: () => getAIProvider(),
  });
  const base = await shared.aiResolver.get();

  // XEELAA on: try it first, answer with the default provider if it fails (ADR-052).
  const xeelaa = shared.xeelaa!;
  const key = await activeXeelaaKey(xeelaa);
  if (!key) return base;
  return new FallbackProvider(new XeelaaProvider(key), base, {
    state: (shared.xeelaaCooldown ??= { skipUntil: 0 }),
    onPrimaryFailure: (error) => {
      const status = (error as { cause?: { status?: unknown } }).cause?.status;
      void xeelaa
        .reportChatFailure(typeof status === "number" ? status : undefined)
        .catch(() => {});
    },
  });
}
