/**
 * npm run whatsapp:setup
 *
 * Sets what WhatsApp itself can show for the business number (ADR-090),
 * using the Cloud API with the app's WhatsApp settings:
 * - the "/" command menu (help, reset, voice_on, …) and four ice breakers
 *   (POST /<phone number ID>/conversational_automation);
 * - the business profile's About and description, website and category
 *   (POST /<phone number ID>/whatsapp_business_profile).
 *
 * WhatsApp has no per-chat "description" or "instructions" like Telegram's
 * bot description: these profile fields and menus are the native parts. The
 * commands themselves are handled by the app (lib/whatsapp/commands.ts).
 * Safe to run again. Prints no secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import {
  COMMAND_MENU,
  ICE_BREAKERS,
  PROFILE_ABOUT,
  PROFILE_DESCRIPTION,
} from "../../lib/whatsapp/commands";
import { getWhatsAppConfig } from "../../lib/whatsapp/config";

async function post(url: string, token: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => null)) as {
    error?: { code?: number; message?: string };
  } | null;
  return { ok: response.ok, status: response.status, code: json?.error?.code ?? null };
}

async function main() {
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const env = { ...local, ...process.env };
  const config = getWhatsAppConfig(env);
  if (!config) throw new Error("Set the four WHATSAPP_ settings first (docs/whatsapp.md).");
  const base = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}`;
  const site = (env.APP_URL || "").replace(/\/$/, "");

  const automation = await post(`${base}/conversational_automation`, config.accessToken, {
    commands: COMMAND_MENU,
    prompts: ICE_BREAKERS,
  });
  console.log(
    `Command menu and ice breakers: ${automation.ok ? "set" : `failed (${automation.status}${automation.code ? `, code ${automation.code}` : ""})`}`,
  );

  const profile = await post(`${base}/whatsapp_business_profile`, config.accessToken, {
    messaging_product: "whatsapp",
    about: PROFILE_ABOUT,
    description: PROFILE_DESCRIPTION,
    vertical: "HEALTH",
    ...(site.startsWith("https://") ? { websites: [site] } : {}),
  });
  console.log(
    `Business profile: ${profile.ok ? "set" : `failed (${profile.status}${profile.code ? `, code ${profile.code}` : ""})`}`,
  );
  if (!automation.ok || !profile.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Setup failed");
  process.exit(1);
});
