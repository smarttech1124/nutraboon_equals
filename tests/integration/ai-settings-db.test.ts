import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCredentialCipher } from "@/lib/ai/settings/crypto";
import { PrismaAISettingsRepository } from "@/lib/ai/settings/repository";
import { AISettingsService } from "@/lib/ai/settings/service";
import { createPrismaClient } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaXeelaaRepository, XeelaaService } from "@/lib/xeelaa/service";

/**
 * AI settings against a real, isolated PostgreSQL database (ADR-047).
 * Runs with `npm run test:db`; replaces all AI settings rows in that database.
 */
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = !!url && /test/i.test(new URL(url).pathname);

const OPENAI_KEY = "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA9X2A";
const DEEPSEEK_KEY = "sk-0123456789abcdef0123456789ab71KF";

describe.skipIf(!isTestDatabase)("AI settings (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let service: AISettingsService;

  beforeAll(() => {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = createPrismaClient(url!);
  }, 120_000);

  beforeEach(async () => {
    await prisma.aIActiveConfig.deleteMany();
    await prisma.aIConfigAuditEvent.deleteMany();
    await prisma.aIProviderConfig.deleteMany();
    service = new AISettingsService({
      repo: PrismaAISettingsRepository.create(prisma),
      cipher: createCredentialCipher(randomBytes(32)),
      verify: async () => ({ ok: true }),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("stores only ciphertext and switches the active configuration atomically", async () => {
    await service.add({
      provider: "openai",
      model: "gpt-test",
      apiKey: OPENAI_KEY,
      activate: true,
    });
    await service.add({ provider: "deepseek", model: "deepseek-chat", apiKey: DEEPSEEK_KEY });
    const [deepseek, openai] = await service.list();

    expect(await service.activate(deepseek.id)).toMatchObject({ ok: true });
    expect(await prisma.aIActiveConfig.findMany()).toEqual([
      expect.objectContaining({ id: 1, configId: deepseek.id }),
    ]);
    expect((await service.list()).find((c) => c.id === openai.id)?.isActive).toBe(false);

    const rows = JSON.stringify([
      await prisma.aIProviderConfig.findMany(),
      await prisma.aIConfigAuditEvent.findMany(),
    ]);
    expect(rows).not.toContain(OPENAI_KEY);
    expect(rows).not.toContain(DEEPSEEK_KEY);
    expect(await service.getActiveCredential()).toMatchObject({ apiKey: DEEPSEEK_KEY });
  });

  it("allows only one active row, enforced by the database", async () => {
    await service.add({
      provider: "openai",
      model: "gpt-test",
      apiKey: OPENAI_KEY,
      activate: true,
    });
    const [config] = await service.list();
    await expect(
      prisma.aIActiveConfig.create({ data: { id: 2, configId: config.id } }),
    ).rejects.toThrow();
  });

  it("revokes inside a transaction: key gone, inactive, audit kept", async () => {
    await service.add({
      provider: "openai",
      model: "gpt-test",
      apiKey: OPENAI_KEY,
      activate: true,
    });
    const [config] = await service.list();
    await service.revoke(config.id);

    const row = await prisma.aIProviderConfig.findUniqueOrThrow({ where: { id: config.id } });
    expect(row.encryptedKey).toBeNull();
    expect(row.status).toBe("revoked");
    expect(await prisma.aIActiveConfig.count()).toBe(0);
    expect((await service.listAudit()).map((e) => e.action).slice(0, 2)).toEqual([
      "revoked",
      "deactivated",
    ]);
  });
});

describe.skipIf(!isTestDatabase)("XEELAA integration (PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(url!);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("keeps one encrypted row and enforces it in the database", async () => {
    await prisma.xeelaaIntegration.deleteMany();
    const audit: string[] = [];
    const service = new XeelaaService({
      repo: new PrismaXeelaaRepository(prisma),
      cipher: createCredentialCipher(randomBytes(32)),
      verify: async () => ({ ok: true }),
      usage: async () => ({ ok: true, items: [] }),
      audit: async (e) => void audit.push(e.action),
    });
    const key = "xla_dbtest:s3cr3tS3cr3tS3cr3t9Z";
    await service.saveKey(key);
    await service.setEnabled(true);
    expect(await service.getActiveKey()).toBe(key);
    expect(JSON.stringify(await prisma.xeelaaIntegration.findMany())).not.toContain(key);
    await expect(
      prisma.xeelaaIntegration.create({ data: { id: 2, keyHint: "x", status: "invalid" } }),
    ).rejects.toThrow();
    expect(audit).toEqual(["verification_succeeded", "credential_added", "activated"]);
  });
});
