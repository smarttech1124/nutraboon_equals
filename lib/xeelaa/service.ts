import { credentialContext, type CredentialCipher } from "@/lib/ai/settings/crypto";
import type { ActionResult } from "@/lib/ai/settings/service";
import type { AuditEventInput } from "@/lib/ai/settings/types";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  XEELAA_KEY_PATTERN,
  describeXeelaaFailure,
  type XeelaaCheck,
  type XeelaaFailure,
  type XeelaaUsage,
} from "./client";

/** The stored integration (one row). Server-only: holds the encrypted key. */
export type XeelaaRecord = {
  encryptedKey: string | null;
  keyHint: string;
  enabled: boolean;
  status: "verified" | "invalid";
  lastCheckedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

/** What the settings page may see. */
export type XeelaaView = {
  configured: boolean;
  keyHint?: string;
  enabled: boolean;
  status?: "verified" | "invalid";
  /** Enabled and verified: chat tries XEELAA first. */
  active: boolean;
  lastCheckedAt?: Date;
  lastError?: string;
};

export interface XeelaaRepository {
  get(): Promise<XeelaaRecord | null>;
  save(record: Omit<XeelaaRecord, "updatedAt">): Promise<void>;
}

const ROW_ID = 1;

export class PrismaXeelaaRepository implements XeelaaRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "xeelaaIntegration">) {}

  get(): Promise<XeelaaRecord | null> {
    return this.prisma.xeelaaIntegration.findUnique({ where: { id: ROW_ID } });
  }

  async save(record: Omit<XeelaaRecord, "updatedAt">): Promise<void> {
    await this.prisma.xeelaaIntegration.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, ...record },
      update: record,
    });
  }
}

export class InMemoryXeelaaRepository implements XeelaaRepository {
  record: XeelaaRecord | null = null;
  async get() {
    return this.record;
  }
  async save(record: Omit<XeelaaRecord, "updatedAt">) {
    this.record = { ...record, updatedAt: new Date() };
  }
}

export type XeelaaDeps = {
  repo: XeelaaRepository;
  cipher: CredentialCipher;
  verify: (apiKey: string) => Promise<XeelaaCheck>;
  usage: (apiKey: string) => Promise<XeelaaUsage>;
  /** Writes to the AI settings audit trail (metadata only). */
  audit: (event: AuditEventInput) => Promise<void>;
  now?: () => Date;
  /** Called when whether chat should use XEELAA may have changed. */
  onChanged?: () => void;
};

const CONTEXT = credentialContext("xeelaa-integration", "xeelaa");
const ACTOR = "admin";

export function maskXeelaaKey(key: string): string {
  return `xla_••••••••${key.slice(-4)}`;
}

/**
 * The XEELAA integration's lifecycle (ADR-052): save a key only after an
 * authenticated XEELAA call accepts it; switch it on only while it is verified; switch
 * it off at any time. A key that later fails in chat is marked invalid, and
 * chat keeps working on the default provider.
 */
export class XeelaaService {
  private readonly now: () => Date;

  constructor(private readonly deps: XeelaaDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async view(): Promise<XeelaaView> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey) return { configured: false, enabled: false, active: false };
    return {
      configured: true,
      keyHint: r.keyHint,
      enabled: r.enabled,
      status: r.status,
      active: r.enabled && r.status === "verified",
      ...(r.lastCheckedAt ? { lastCheckedAt: r.lastCheckedAt } : {}),
      ...(r.lastError ? { lastError: r.lastError } : {}),
    };
  }

  async saveKey(rawKey: string): Promise<ActionResult> {
    const key = rawKey.trim();
    if (!key) return { ok: false, error: "Enter the XEELAA API key." };
    if (!XEELAA_KEY_PATTERN.test(key)) {
      return { ok: false, error: "That does not look like a XEELAA key (xla_<key id>:<secret>)." };
    }
    const keyHint = maskXeelaaKey(key);
    const check = await this.deps.verify(key);
    if (!check.ok) {
      await this.audit("verification_failed", keyHint, check.reason);
      return { ok: false, error: describeXeelaaFailure(check) };
    }
    const existing = await this.deps.repo.get();
    await this.deps.repo.save({
      encryptedKey: this.deps.cipher.encrypt(key, CONTEXT),
      keyHint,
      // Replacing the key keeps the switch where the admin left it.
      enabled: existing?.enabled ?? false,
      status: "verified",
      lastCheckedAt: this.now(),
      lastError: null,
    });
    await this.audit("verification_succeeded", keyHint);
    await this.audit("credential_added", keyHint);
    this.deps.onChanged?.();
    return { ok: true, message: "XEELAA key verified and saved." };
  }

  async setEnabled(on: boolean): Promise<ActionResult> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey) return { ok: false, error: "Add a XEELAA key first." };
    if (!on) {
      await this.deps.repo.save({ ...r, enabled: false });
      await this.audit("deactivated", r.keyHint);
      this.deps.onChanged?.();
      return { ok: true, message: "XEELAA is off. Chat uses the default AI settings." };
    }
    // Never switch on a key that no longer works.
    const check = await this.deps.verify(this.decrypt(r));
    if (!check.ok) {
      await this.recordFailure(r, check.reason);
      return { ok: false, error: `${describeXeelaaFailure(check)} XEELAA stays off.` };
    }
    await this.deps.repo.save({
      ...r,
      enabled: true,
      status: "verified",
      lastCheckedAt: this.now(),
      lastError: null,
    });
    await this.audit("activated", r.keyHint);
    this.deps.onChanged?.();
    return { ok: true, message: "XEELAA is on. Chat falls back to the default if it fails." };
  }

  async recheck(): Promise<ActionResult> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey) return { ok: false, error: "Add a XEELAA key first." };
    const check = await this.deps.verify(this.decrypt(r));
    if (!check.ok) {
      await this.recordFailure(r, check.reason);
      return { ok: false, error: describeXeelaaFailure(check) };
    }
    await this.deps.repo.save({
      ...r,
      status: "verified",
      lastCheckedAt: this.now(),
      lastError: null,
    });
    await this.audit("verification_succeeded", r.keyHint);
    this.deps.onChanged?.();
    return { ok: true, message: "XEELAA key verified." };
  }

  async usage(): Promise<XeelaaUsage> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey) return { ok: false, reason: "rejected" };
    return this.deps.usage(this.decrypt(r));
  }

  async removeKey(): Promise<ActionResult> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey) return { ok: true, message: "No XEELAA key is stored." };
    await this.deps.repo.save({ ...r, encryptedKey: null, enabled: false, status: "invalid" });
    await this.audit("revoked", r.keyHint);
    this.deps.onChanged?.();
    return { ok: true, message: "XEELAA key deleted. Also revoke it in your XEELAA dashboard." };
  }

  /**
   * Called when a chat request through XEELAA failed. A rejected key is
   * marked invalid so chat stops trying it; other failures only wait out
   * the fallback cool-down.
   */
  async reportChatFailure(status: number | undefined): Promise<void> {
    if (status !== 401 && status !== 403) return;
    const r = await this.deps.repo.get();
    if (r?.encryptedKey && r.status === "verified")
      await this.recordFailure(r, "invalid_key", "chat");
  }

  /** The key to use for chat, only while switched on and verified. */
  async getActiveKey(): Promise<string | null> {
    const r = await this.deps.repo.get();
    if (!r?.encryptedKey || !r.enabled || r.status !== "verified") return null;
    return this.decrypt(r);
  }

  private async recordFailure(r: XeelaaRecord, reason: XeelaaFailure, source?: string) {
    // Only a rejected key is definitive; a network blip leaves the status alone.
    const definitive = reason === "invalid_key";
    await this.deps.repo.save({
      ...r,
      status: definitive ? "invalid" : r.status,
      lastCheckedAt: this.now(),
      lastError: reason,
    });
    await this.audit("verification_failed", r.keyHint, source ? `${source}:${reason}` : reason);
    if (definitive) this.deps.onChanged?.();
  }

  private decrypt(r: XeelaaRecord): string {
    return this.deps.cipher.decrypt(r.encryptedKey!, CONTEXT);
  }

  private audit(action: AuditEventInput["action"], keyHint: string, detail?: string) {
    return this.deps.audit({
      action,
      configId: null,
      provider: "xeelaa",
      model: "ai/chat",
      keyHint,
      ...(detail ? { detail } : {}),
      actor: ACTOR,
    });
  }
}
