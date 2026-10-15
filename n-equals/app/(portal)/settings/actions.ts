"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { entitlementsFromForm } from "@/lib/billing/entitlements";
import { PrismaBillingRepository } from "@/lib/billing/repository";
import {
  FEATURE_FLAG_KEYS,
  MAX_GRACE_DAYS,
  MAX_RADIUS_KM,
  SETTING_KEYS,
} from "@/lib/billing/settings";

/**
 * Platform settings (ADR-062): feature flags, the free tier, the billing grace
 * period and the default hospital search distance (ADR-068).
 */

type Flat = Record<string, string | number | boolean | null>;

async function save(key: string, value: Flat | number, actorUserId: string) {
  await new PrismaBillingRepository(getPrisma()).setSetting(key, value, actorUserId);
  await recordAudit({
    actorUserId,
    action: "setting.updated",
    targetType: "setting",
    targetId: key,
    metadata: typeof value === "number" ? { value } : value,
  });
  revalidatePath("/settings");
}

export async function saveFeaturesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return asAdmin("settings.manage", "settings_features", async (admin) => {
    const flags = Object.fromEntries(
      FEATURE_FLAG_KEYS.map((key) => [key, formData.get(key) === "on"]),
    );
    await save(SETTING_KEYS.features, flags, admin.id);
    return { status: "success", message: "Features saved." };
  });
}

export async function saveFreeTierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return asAdmin("settings.manage", "settings_free_tier", async (admin) => {
    const parsed = entitlementsFromForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    await save(SETTING_KEYS.freeEntitlements, parsed.value, admin.id);
    return { status: "success", message: "Free tier saved." };
  });
}

export async function saveGraceDaysAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get("graceDays");
  const days = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(days) || days < 0 || days > MAX_GRACE_DAYS) {
    return {
      status: "error",
      message: `Enter a whole number of days from 0 to ${MAX_GRACE_DAYS}.`,
    };
  }
  return asAdmin("settings.manage", "settings_grace", async (admin) => {
    await save(SETTING_KEYS.graceDays, days, admin.id);
    return { status: "success", message: "Grace period saved." };
  });
}

export async function saveHospitalRadiusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get("radiusKm");
  const km = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(km) || km < 1 || km > MAX_RADIUS_KM) {
    return { status: "error", message: `Enter a whole number of km from 1 to ${MAX_RADIUS_KM}.` };
  }
  return asAdmin("settings.manage", "settings_hospital_radius", async (admin) => {
    await save(SETTING_KEYS.hospitalRadiusKm, km, admin.id);
    return { status: "success", message: "Search distance saved." };
  });
}
