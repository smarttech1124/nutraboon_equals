import type { ProviderKind } from "./providers";

export type CredentialStatus = "verified" | "failed" | "revoked";

export type AuditAction =
  | "credential_added"
  | "verification_succeeded"
  | "verification_failed"
  | "activated"
  | "deactivated"
  | "revoked"
  | "model_changed";

/** A stored configuration, including its encrypted key. Server-only. */
export type ProviderConfigRecord = {
  id: string;
  provider: ProviderKind;
  model: string;
  label: string | null;
  encryptedKey: string | null;
  keyHint: string;
  keyFingerprint: string;
  status: CredentialStatus;
  verifiedAt: Date | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What the settings page may see. Built field by field (never by spreading a
 * record), so the encrypted key and fingerprint cannot leak into it.
 */
export type ProviderConfigView = {
  id: string;
  provider: ProviderKind;
  model: string;
  label: string | null;
  keyHint: string;
  status: CredentialStatus;
  isActive: boolean;
  verifiedAt: Date | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
};

export type AuditEventInput = {
  action: AuditAction;
  configId: string | null;
  /** "xeelaa" for the XEELAA integration (ADR-052). */
  provider: ProviderKind | "xeelaa";
  model: string;
  keyHint: string;
  detail?: string;
  actor: string;
};

export type AuditEvent = AuditEventInput & { id: number; createdAt: Date };

export type ConfigPatch = Partial<
  Pick<
    ProviderConfigRecord,
    "model" | "encryptedKey" | "status" | "verifiedAt" | "activatedAt" | "deactivatedAt"
  >
>;

/** Storage for AI settings. `transaction` runs `fn` atomically. */
export interface AISettingsRepository {
  listConfigs(): Promise<ProviderConfigRecord[]>;
  getConfig(id: string): Promise<ProviderConfigRecord | null>;
  /** Non-revoked configurations holding the same key. */
  findLiveByFingerprint(fingerprint: string): Promise<ProviderConfigRecord[]>;
  createConfig(record: Omit<ProviderConfigRecord, "createdAt" | "updatedAt">): Promise<void>;
  updateConfig(id: string, patch: ConfigPatch): Promise<void>;
  getActiveId(): Promise<string | null>;
  setActiveId(id: string | null): Promise<void>;
  addAudit(event: AuditEventInput): Promise<void>;
  listAudit(limit: number): Promise<AuditEvent[]>;
  transaction<T>(fn: (repo: AISettingsRepository) => Promise<T>): Promise<T>;
}
