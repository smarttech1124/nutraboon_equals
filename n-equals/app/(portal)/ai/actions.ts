"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { getAISettings, getXeelaa } from "@/lib/ai/settings/runtime";
import type { ActionResult } from "@/lib/ai/settings/service";
import { recordAudit } from "@/lib/audit";
import { describeXeelaaFailure, type UsageItem } from "@/lib/xeelaa/client";

/**
 * AI provider and XEELAA settings (ADR-047, ADR-052), in n-equals since
 * ADR-060. Every action checks the "ai.manage" permission itself. Results
 * carry fixed messages only: never a key, a provider's error text or a stack.
 */

export type FormState = ActionState & {
  /** XEELAA usage figures, when that was asked for. */
  usage?: UsageItem[];
};

const PATH = "/ai";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function toState(result: ActionResult): FormState {
  return result.ok
    ? { status: "success", message: result.message }
    : { status: "error", message: result.error };
}

function missing(names: string[]): FormState {
  return { status: "error", message: `Set ${names.join(" and ")} on the server first.` };
}

export async function addConfigAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return asAdmin("ai.manage", "ai_add", async (user) => {
    const provider = field(formData, "provider");
    if (provider === "xeelaa") return addXeelaa(user.id, formData);
    const settings = getAISettings();
    if (!settings.ok) return missing(settings.missing);
    const model = field(formData, "model");
    const result = await settings.service.add({
      provider,
      model,
      label: field(formData, "label") || undefined,
      apiKey: field(formData, "apiKey"),
      activate: formData.get("activate") === "on",
    });
    if (result.ok) {
      await recordAudit({
        actorUserId: user.id,
        action: "ai_config.added",
        targetType: "ai_config",
        metadata: { provider, model },
      });
    }
    revalidatePath(PATH);
    return toState(result);
  });
}

/**
 * XEELAA is added from the same form as other providers (ADR-080): the key is
 * verified and saved, and switched on when "use for chat" was ticked.
 */
async function addXeelaa(userId: string, formData: FormData): Promise<FormState> {
  const xeelaa = getXeelaa();
  if (!xeelaa.ok) return missing(xeelaa.missing);
  const saved = await xeelaa.service.saveKey(field(formData, "apiKey"));
  if (!saved.ok) {
    revalidatePath(PATH);
    return toState(saved);
  }
  await recordAudit({ actorUserId: userId, action: "xeelaa.key_saved", targetType: "xeelaa" });
  if (formData.get("activate") === "on") {
    const enabled = await xeelaa.service.setEnabled(true);
    if (enabled.ok) {
      await recordAudit({ actorUserId: userId, action: "xeelaa.enable", targetType: "xeelaa" });
    }
    revalidatePath(PATH);
    return enabled.ok
      ? {
          status: "success",
          message: "XEELAA key verified and saved. Chat now tries XEELAA first.",
        }
      : toState(enabled);
  }
  revalidatePath(PATH);
  return toState(saved);
}

const INTENTS = ["activate", "deactivate", "revoke", "reverify", "changeModel"] as const;
type Intent = (typeof INTENTS)[number];

export async function manageConfigAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const intent = field(formData, "intent") as Intent;
  const id = field(formData, "id");
  if (!INTENTS.includes(intent) || !id) return FAILED;
  return asAdmin("ai.manage", `ai_${intent}`, async (user) => {
    const settings = getAISettings();
    if (!settings.ok) return missing(settings.missing);
    const service = settings.service;
    const result =
      intent === "activate"
        ? await service.activate(id)
        : intent === "deactivate"
          ? await service.deactivate(id)
          : intent === "revoke"
            ? await service.revoke(id)
            : intent === "reverify"
              ? await service.reverify(id)
              : await service.changeModel(id, field(formData, "model"));
    if (result.ok) {
      await recordAudit({
        actorUserId: user.id,
        action: `ai_config.${intent}`,
        targetType: "ai_config",
        targetId: id,
      });
    }
    revalidatePath(PATH);
    return toState(result);
  });
}

export async function xeelaaManageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const intent = field(formData, "intent");
  return asAdmin("ai.manage", `xeelaa_${intent || "manage"}`, async (user) => {
    const xeelaa = getXeelaa();
    if (!xeelaa.ok) return missing(xeelaa.missing);
    const service = xeelaa.service;
    if (intent === "usage") {
      const usage = await service.usage();
      return usage.ok
        ? {
            status: "success",
            message:
              usage.items.length > 0 ? "Usage from XEELAA:" : "XEELAA returned no usage figures.",
            usage: usage.items,
          }
        : { status: "error", message: describeXeelaaFailure(usage) };
    }
    const result =
      intent === "enable"
        ? await service.setEnabled(true)
        : intent === "disable"
          ? await service.setEnabled(false)
          : intent === "recheck"
            ? await service.recheck()
            : intent === "remove"
              ? await service.removeKey()
              : null;
    if (!result) return FAILED;
    if (result.ok) {
      await recordAudit({ actorUserId: user.id, action: `xeelaa.${intent}`, targetType: "xeelaa" });
    }
    revalidatePath(PATH);
    return toState(result);
  });
}
