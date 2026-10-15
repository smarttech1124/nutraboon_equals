import { randomUUID } from "node:crypto";
import { z } from "zod";
import { credentialContext, maskKey, type CredentialCipher } from "./crypto";
import {
  isProviderKind,
  MODEL_PATTERN,
  PROVIDERS,
  VERIFICATION_MESSAGES,
  type ProviderKind,
  type VerificationFailure,
  type VerificationResult,
} from "./providers";
import type {
  AISettingsRepository,
  AuditAction,
  AuditEvent,
  AuditEventInput,
  ProviderConfigRecord,
  ProviderConfigView,
} from "./types";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type Verifier = (
  provider: ProviderKind,
  apiKey: string,
  model: string,
) => Promise<VerificationResult>;

export type AISettingsDeps = {
  repo: AISettingsRepository;
  cipher: CredentialCipher;
  verify: Verifier;
  now?: () => Date;
  /** Called after the active configuration may have changed. */
  onActiveChanged?: () => void;
};

const ACTOR = "admin";

const addSchema = z.object({
  provider: z.string().refine(isProviderKind, "Choose a provider."),
  model: z.string().trim().regex(MODEL_PATTERN, "Enter a valid model ID, e.g. gemini-3.8-flash."),
  label: z.string().trim().max(60, "Keep the name under 60 characters.").optional(),
  apiKey: z.string().trim().min(1, "Enter the API key."),
  activate: z.boolean().optional(),
});

export type AddConfigInput = z.input<typeof addSchema>;

/** Failures that mean the stored key or model is unusable, not a passing glitch. */
const DEFINITIVE: ReadonlySet<VerificationFailure> = new Set([
  "invalid_key",
  "model_unavailable",
  "no_credit",
]);

/**
 * Credential lifecycle (ADR-047):
 * Submitted → Verified → Encrypted and stored → Available → Activated.
 * A key that fails verification is never stored; only an audit event is kept.
 * Plain keys only exist inside `add` and when building a provider.
 */
export class AISettingsService {
  private readonly repo: AISettingsRepository;
  private readonly cipher: CredentialCipher;
  private readonly verify: Verifier;
  private readonly now: () => Date;
  private readonly onActiveChanged: () => void;

  constructor(deps: AISettingsDeps) {
    this.repo = deps.repo;
    this.cipher = deps.cipher;
    this.verify = deps.verify;
    this.now = deps.now ?? (() => new Date());
    this.onActiveChanged = deps.onActiveChanged ?? (() => {});
  }

  async list(): Promise<ProviderConfigView[]> {
    const [configs, activeId] = await Promise.all([
      this.repo.listConfigs(),
      this.repo.getActiveId(),
    ]);
    return configs.map((c) => toView(c, c.id === activeId));
  }

  listAudit(limit = 50): Promise<AuditEvent[]> {
    return this.repo.listAudit(limit);
  }

  async add(input: AddConfigInput): Promise<ActionResult> {
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const { model, apiKey, activate } = parsed.data;
    const provider = parsed.data.provider as ProviderKind;
    const label = parsed.data.label || null;
    const spec = PROVIDERS[provider];
    if (!spec.keyPattern.test(apiKey)) {
      return { ok: false, error: `That does not look like ${spec.keyFormatHint}.` };
    }

    const keyHint = maskKey(apiKey);
    const fingerprint = this.cipher.fingerprint(apiKey);
    const duplicate = (await this.repo.findLiveByFingerprint(fingerprint)).find(
      (c) => c.provider === provider && c.model === model,
    );
    if (duplicate) {
      return {
        ok: false,
        error: `This key and model are already saved${duplicate.label ? ` as "${duplicate.label}"` : ""}.`,
      };
    }

    const result = await this.verify(provider, apiKey, model);
    if (!result.ok) {
      await this.repo.addAudit({
        action: "verification_failed",
        configId: null,
        provider,
        model,
        keyHint,
        detail: result.reason,
        actor: ACTOR,
      });
      return { ok: false, error: VERIFICATION_MESSAGES[result.reason] };
    }

    const id = randomUUID();
    const now = this.now();
    const record = {
      id,
      provider,
      model,
      label,
      encryptedKey: this.cipher.encrypt(apiKey, credentialContext(id, provider)),
      keyHint,
      keyFingerprint: fingerprint,
      status: "verified" as const,
      verifiedAt: now,
      activatedAt: null,
      deactivatedAt: null,
    };
    await this.repo.transaction(async (repo) => {
      await repo.createConfig(record);
      await repo.addAudit(audit("verification_succeeded", record));
      await repo.addAudit(audit("credential_added", record));
    });

    if (activate) {
      const activated = await this.activate(id);
      if (!activated.ok) return activated;
      return { ok: true, message: "Key verified, saved and now in use." };
    }
    return { ok: true, message: "Key verified and saved. Activate it when you are ready." };
  }

  async activate(id: string): Promise<ActionResult> {
    const result = await this.repo.transaction(async (repo): Promise<ActionResult> => {
      const target = await repo.getConfig(id);
      if (!target) return { ok: false, error: "That configuration no longer exists." };
      if (target.status !== "verified" || !target.encryptedKey) {
        return { ok: false, error: "Only a verified key can be activated. Re-check it first." };
      }
      const currentId = await repo.getActiveId();
      if (currentId === id) return { ok: true, message: "Already in use." };

      const now = this.now();
      if (currentId) {
        const current = await repo.getConfig(currentId);
        await repo.updateConfig(currentId, { deactivatedAt: now });
        if (current) await repo.addAudit(audit("deactivated", current, "switched"));
      }
      await repo.setActiveId(id);
      await repo.updateConfig(id, { activatedAt: now });
      await repo.addAudit(audit("activated", target));
      return {
        ok: true,
        message: `Now using ${PROVIDERS[target.provider].label} ${target.model}.`,
      };
    });
    if (result.ok) this.onActiveChanged();
    return result;
  }

  async deactivate(id: string): Promise<ActionResult> {
    const result = await this.repo.transaction(async (repo): Promise<ActionResult> => {
      if ((await repo.getActiveId()) !== id) {
        return { ok: false, error: "That configuration is not active." };
      }
      const target = await repo.getConfig(id);
      await repo.setActiveId(null);
      await repo.updateConfig(id, { deactivatedAt: this.now() });
      if (target) await repo.addAudit(audit("deactivated", target));
      return { ok: true, message: "Deactivated. Chat now uses the environment settings." };
    });
    if (result.ok) this.onActiveChanged();
    return result;
  }

  /** Destroys the stored key. The row stays (without the key) for the audit trail. */
  async revoke(id: string): Promise<ActionResult> {
    const result = await this.repo.transaction(async (repo): Promise<ActionResult> => {
      const target = await repo.getConfig(id);
      if (!target) return { ok: false, error: "That configuration no longer exists." };
      if (target.status === "revoked") return { ok: true, message: "Already revoked." };
      const now = this.now();
      if ((await repo.getActiveId()) === id) {
        await repo.setActiveId(null);
        await repo.updateConfig(id, { deactivatedAt: now });
        await repo.addAudit(audit("deactivated", target, "revoked"));
      }
      await repo.updateConfig(id, { encryptedKey: null, status: "revoked" });
      await repo.addAudit(audit("revoked", target));
      return {
        ok: true,
        message: "Key deleted from storage. Also revoke it in the provider's dashboard.",
      };
    });
    if (result.ok) this.onActiveChanged();
    return result;
  }

  /** Re-checks a stored key. A definitive failure marks it failed and deactivates it. */
  async reverify(id: string): Promise<ActionResult> {
    const target = await this.repo.getConfig(id);
    if (!target?.encryptedKey) return { ok: false, error: "This key is no longer stored." };
    const result = await this.verify(target.provider, this.decrypt(target), target.model);

    if (result.ok) {
      await this.repo.transaction(async (repo) => {
        await repo.updateConfig(id, { status: "verified", verifiedAt: this.now() });
        await repo.addAudit(audit("verification_succeeded", target));
      });
      return { ok: true, message: "Key verified." };
    }

    let deactivated = false;
    await this.repo.transaction(async (repo) => {
      await repo.addAudit(audit("verification_failed", target, result.reason));
      if (!DEFINITIVE.has(result.reason)) return;
      await repo.updateConfig(id, { status: "failed" });
      if ((await repo.getActiveId()) === id) {
        await repo.setActiveId(null);
        await repo.updateConfig(id, { deactivatedAt: this.now() });
        await repo.addAudit(audit("deactivated", target, "verification_failed"));
        deactivated = true;
      }
    });
    if (deactivated) this.onActiveChanged();
    const suffix = deactivated
      ? " It was deactivated; chat now uses the environment settings."
      : "";
    return { ok: false, error: VERIFICATION_MESSAGES[result.reason] + suffix };
  }

  /** Switches a stored key to another model, after checking the key can use it. */
  async changeModel(id: string, rawModel: string): Promise<ActionResult> {
    const model = rawModel.trim();
    if (!MODEL_PATTERN.test(model)) {
      return { ok: false, error: "Enter a valid model ID." };
    }
    const target = await this.repo.getConfig(id);
    if (!target?.encryptedKey) return { ok: false, error: "This key is no longer stored." };
    if (target.model === model) return { ok: true, message: "Model unchanged." };

    const result = await this.verify(target.provider, this.decrypt(target), model);
    if (!result.ok) {
      await this.repo.addAudit({
        ...audit("verification_failed", target, result.reason),
        model,
      });
      return { ok: false, error: VERIFICATION_MESSAGES[result.reason] };
    }

    let wasActive = false;
    await this.repo.transaction(async (repo) => {
      await repo.updateConfig(id, { model, status: "verified", verifiedAt: this.now() });
      await repo.addAudit({ ...audit("verification_succeeded", target), model });
      await repo.addAudit({ ...audit("model_changed", target, `from:${target.model}`), model });
      wasActive = (await repo.getActiveId()) === id;
    });
    if (wasActive) this.onActiveChanged();
    return { ok: true, message: `Model changed to ${model}.` };
  }

  /** The active configuration with its key decrypted, for building the chat provider. */
  async getActiveCredential(): Promise<{
    id: string;
    provider: ProviderKind;
    model: string;
    apiKey: string;
    updatedAt: Date;
  } | null> {
    const id = await this.repo.getActiveId();
    if (!id) return null;
    const config = await this.repo.getConfig(id);
    if (!config?.encryptedKey || config.status !== "verified") return null;
    return {
      id,
      provider: config.provider,
      model: config.model,
      apiKey: this.decrypt(config),
      updatedAt: config.updatedAt,
    };
  }

  private decrypt(config: ProviderConfigRecord): string {
    return this.cipher.decrypt(config.encryptedKey!, credentialContext(config.id, config.provider));
  }
}

function audit(
  action: AuditAction,
  config: Pick<ProviderConfigRecord, "id" | "provider" | "model" | "keyHint">,
  detail?: string,
): AuditEventInput {
  return {
    action,
    configId: config.id,
    provider: config.provider,
    model: config.model,
    keyHint: config.keyHint,
    ...(detail ? { detail } : {}),
    actor: ACTOR,
  };
}

function toView(c: ProviderConfigRecord, isActive: boolean): ProviderConfigView {
  return {
    id: c.id,
    provider: c.provider,
    model: c.model,
    label: c.label,
    keyHint: c.keyHint,
    status: c.status,
    isActive,
    verifiedAt: c.verifiedAt,
    activatedAt: c.activatedAt,
    deactivatedAt: c.deactivatedAt,
    createdAt: c.createdAt,
  };
}
