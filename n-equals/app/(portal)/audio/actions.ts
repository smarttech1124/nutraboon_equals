"use server";

import { revalidatePath } from "next/cache";
import { asAdmin, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/db";
import { PrismaBillingRepository } from "@/lib/billing/repository";
import { SETTING_KEYS, SPEECH_TO_TEXT_PROVIDERS } from "@/lib/billing/settings";

/** Speech provider choice (ADR-069). Only available providers can be chosen. */
export async function saveAudioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const stt = formData.get("speechToText");
  const provider =
    typeof stt === "string" && Object.hasOwn(SPEECH_TO_TEXT_PROVIDERS, stt)
      ? SPEECH_TO_TEXT_PROVIDERS[stt as keyof typeof SPEECH_TO_TEXT_PROVIDERS]
      : null;
  if (!provider) return { status: "error", message: "Choose a speech-to-text provider." };
  if (!provider.available) {
    return { status: "error", message: `${provider.label} is not available yet.` };
  }
  return asAdmin("audio.manage", "audio_settings", async (admin) => {
    const value = { speechToText: stt as string, textToSpeech: "browser" };
    await new PrismaBillingRepository(getPrisma()).setSetting(SETTING_KEYS.audio, value, admin.id);
    await recordAudit({
      actorUserId: admin.id,
      action: "setting.updated",
      targetType: "setting",
      targetId: SETTING_KEYS.audio,
      metadata: value,
    });
    revalidatePath("/audio");
    return { status: "success", message: "Audio settings saved." };
  });
}
