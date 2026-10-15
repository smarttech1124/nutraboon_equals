import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  AISettingsRepository,
  AuditEvent,
  AuditEventInput,
  ConfigPatch,
  ProviderConfigRecord,
} from "./types";

const ACTIVE_ROW_ID = 1;

/** Either the client or the client inside an interactive transaction. */
type Db = Pick<PrismaClient, "aIProviderConfig" | "aIActiveConfig" | "aIConfigAuditEvent">;

/** PostgreSQL storage for AI settings (ADR-047). */
export class PrismaAISettingsRepository implements AISettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly client?: PrismaClient,
  ) {}

  static create(prisma: PrismaClient): PrismaAISettingsRepository {
    return new PrismaAISettingsRepository(prisma, prisma);
  }

  // Configurations are only ever created for ProviderKind values; "xeelaa" in
  // the shared enum is used by audit events alone (ADR-052).
  async listConfigs(): Promise<ProviderConfigRecord[]> {
    return (await this.db.aIProviderConfig.findMany({
      orderBy: { createdAt: "desc" },
    })) as ProviderConfigRecord[];
  }

  async getConfig(id: string): Promise<ProviderConfigRecord | null> {
    return (await this.db.aIProviderConfig.findUnique({
      where: { id },
    })) as ProviderConfigRecord | null;
  }

  async findLiveByFingerprint(fingerprint: string): Promise<ProviderConfigRecord[]> {
    return (await this.db.aIProviderConfig.findMany({
      where: { keyFingerprint: fingerprint, status: { not: "revoked" } },
    })) as ProviderConfigRecord[];
  }

  async createConfig(record: Omit<ProviderConfigRecord, "createdAt" | "updatedAt">): Promise<void> {
    await this.db.aIProviderConfig.create({ data: record });
  }

  async updateConfig(id: string, patch: ConfigPatch): Promise<void> {
    await this.db.aIProviderConfig.update({ where: { id }, data: patch });
  }

  async getActiveId(): Promise<string | null> {
    const row = await this.db.aIActiveConfig.findUnique({ where: { id: ACTIVE_ROW_ID } });
    return row?.configId ?? null;
  }

  async setActiveId(id: string | null): Promise<void> {
    if (id === null) {
      await this.db.aIActiveConfig.deleteMany({ where: { id: ACTIVE_ROW_ID } });
      return;
    }
    await this.db.aIActiveConfig.upsert({
      where: { id: ACTIVE_ROW_ID },
      create: { id: ACTIVE_ROW_ID, configId: id },
      update: { configId: id },
    });
  }

  async addAudit(event: AuditEventInput): Promise<void> {
    await this.db.aIConfigAuditEvent.create({ data: { ...event, detail: event.detail ?? null } });
  }

  async listAudit(limit: number): Promise<AuditEvent[]> {
    const rows = await this.db.aIConfigAuditEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((r) => ({ ...r, detail: r.detail ?? undefined }));
  }

  transaction<T>(fn: (repo: AISettingsRepository) => Promise<T>): Promise<T> {
    if (!this.client) return fn(this); // already inside a transaction
    // Serializable, so two admins cannot activate and revoke the same key at once.
    return this.client.$transaction((tx) => fn(new PrismaAISettingsRepository(tx)), {
      isolationLevel: "Serializable",
    });
  }
}

/** Process-local storage for tests. */
export class InMemoryAISettingsRepository implements AISettingsRepository {
  readonly configs = new Map<string, ProviderConfigRecord>();
  readonly audit: AuditEvent[] = [];
  activeId: string | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listConfigs() {
    return [...this.configs.values()].sort((a, b) => +b.createdAt - +a.createdAt);
  }
  async getConfig(id: string) {
    return this.configs.get(id) ?? null;
  }
  async findLiveByFingerprint(fingerprint: string) {
    return [...this.configs.values()].filter(
      (c) => c.keyFingerprint === fingerprint && c.status !== "revoked",
    );
  }
  async createConfig(record: Omit<ProviderConfigRecord, "createdAt" | "updatedAt">) {
    const now = this.now();
    this.configs.set(record.id, { ...record, createdAt: now, updatedAt: now });
  }
  async updateConfig(id: string, patch: ConfigPatch) {
    const existing = this.configs.get(id);
    if (!existing) throw new Error("not found");
    this.configs.set(id, { ...existing, ...patch, updatedAt: this.now() });
  }
  async getActiveId() {
    return this.activeId;
  }
  async setActiveId(id: string | null) {
    this.activeId = id;
  }
  async addAudit(event: AuditEventInput) {
    this.audit.push({ ...event, id: this.audit.length + 1, createdAt: this.now() });
  }
  async listAudit(limit: number) {
    return [...this.audit].reverse().slice(0, limit);
  }
  transaction<T>(fn: (repo: AISettingsRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
