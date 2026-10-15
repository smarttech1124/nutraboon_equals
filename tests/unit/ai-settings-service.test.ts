import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialCipher } from "@/lib/ai/settings/crypto";
import type { VerificationResult } from "@/lib/ai/settings/providers";
import { InMemoryAISettingsRepository } from "@/lib/ai/settings/repository";
import { AISettingsService, type Verifier } from "@/lib/ai/settings/service";

const OPENAI_KEY = "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA9X2A";
const DEEPSEEK_KEY = "sk-0123456789abcdef0123456789ab71KF";
const GEMINI_KEY = "AIzaSyD-0123456789abcdefghijklmnopqrs";

let repo: InMemoryAISettingsRepository;
let verify: ReturnType<typeof vi.fn<Verifier>>;
let onActiveChanged: ReturnType<typeof vi.fn<() => void>>;
let service: AISettingsService;
let clock: number;

beforeEach(() => {
  clock = Date.UTC(2026, 9, 4, 9, 0);
  const now = () => new Date(clock++);
  repo = new InMemoryAISettingsRepository(now);
  verify = vi.fn<Verifier>(async () => ({ ok: true }) as VerificationResult);
  onActiveChanged = vi.fn<() => void>();
  service = new AISettingsService({
    repo,
    cipher: createCredentialCipher(randomBytes(32)),
    verify,
    now,
    onActiveChanged,
  });
});

/** Everything the repository holds, as text, to search for leaked keys. */
const stored = () => JSON.stringify({ configs: [...repo.configs.values()], audit: repo.audit });

async function addOk(provider: string, apiKey: string, model: string, activate = false) {
  const result = await service.add({ provider, apiKey, model, activate });
  expect(result).toMatchObject({ ok: true });
  return (await service.list()).find((c) => c.model === model && c.provider === provider)!;
}

describe("adding a key", () => {
  it("verifies first, then stores it encrypted with a masked hint and audit events", async () => {
    const result = await service.add({
      provider: "openai",
      model: "gpt-test",
      label: "Main",
      apiKey: `  ${OPENAI_KEY} `,
    });

    expect(result).toEqual({
      ok: true,
      message: "Key verified and saved. Activate it when you are ready.",
    });
    expect(verify).toHaveBeenCalledWith("openai", OPENAI_KEY, "gpt-test");
    const [view] = await service.list();
    expect(view).toMatchObject({
      provider: "openai",
      model: "gpt-test",
      label: "Main",
      keyHint: "sk-proj-••••••••9X2A",
      status: "verified",
      isActive: false,
    });
    expect(view).not.toHaveProperty("encryptedKey");
    expect(view).not.toHaveProperty("keyFingerprint");
    expect(stored()).not.toContain(OPENAI_KEY);
    expect(repo.audit.map((e) => e.action)).toEqual(["verification_succeeded", "credential_added"]);
    expect(onActiveChanged).not.toHaveBeenCalled();
  });

  it("stores nothing when verification fails, and audits the failure without the key", async () => {
    verify.mockResolvedValueOnce({ ok: false, reason: "invalid_key" });
    const result = await service.add({
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: DEEPSEEK_KEY,
    });

    expect(result).toEqual({
      ok: false,
      error: "The provider rejected this API key. Check that it is correct and still active.",
    });
    expect(repo.configs.size).toBe(0);
    expect(repo.audit).toEqual([
      expect.objectContaining({
        action: "verification_failed",
        configId: null,
        provider: "deepseek",
        keyHint: "sk-••••••••71KF",
        detail: "invalid_key",
      }),
    ]);
    expect(stored()).not.toContain(DEEPSEEK_KEY);
  });

  it.each([
    [{ provider: "acme", model: "m", apiKey: OPENAI_KEY }, "Choose a provider."],
    [{ provider: "openai", model: "bad model!", apiKey: OPENAI_KEY }, /valid model ID/],
    [{ provider: "openai", model: "gpt", apiKey: "   " }, "Enter the API key."],
    [
      { provider: "openai", model: "gpt", apiKey: "pk-not-an-openai-key-123456" },
      /starting with sk-/,
    ],
    [
      { provider: "gemini", model: "g", apiKey: "has spaces in it 1234567890123456" },
      /Google AI Studio/,
    ],
  ])("rejects malformed input before calling the provider: %j", async (input, error) => {
    const result = await service.add(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(error);
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses the same key and model twice, but allows the key with another model", async () => {
    await addOk("gemini", GEMINI_KEY, "gemini-a");
    expect(
      await service.add({ provider: "gemini", model: "gemini-a", apiKey: GEMINI_KEY }),
    ).toEqual({
      ok: false,
      error: "This key and model are already saved.",
    });
    await addOk("gemini", GEMINI_KEY, "gemini-b");
    expect(repo.configs.size).toBe(2);
  });

  it("can activate straight away", async () => {
    const result = await service.add({
      provider: "gemini",
      model: "gemini-a",
      apiKey: GEMINI_KEY,
      activate: true,
    });
    expect(result).toEqual({ ok: true, message: "Key verified, saved and now in use." });
    expect((await service.list())[0].isActive).toBe(true);
    expect(onActiveChanged).toHaveBeenCalledOnce();
  });
});

describe("activation", () => {
  it("switches A to B: deactivates A, activates B, one active at a time", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    const b = await addOk("deepseek", DEEPSEEK_KEY, "deepseek-chat");
    repo.audit.length = 0;

    expect(await service.activate(b.id)).toEqual({
      ok: true,
      message: "Now using DeepSeek deepseek-chat.",
    });
    const list = await service.list();
    expect(list.filter((c) => c.isActive).map((c) => c.id)).toEqual([b.id]);
    expect(list.find((c) => c.id === a.id)?.deactivatedAt).toBeInstanceOf(Date);
    expect(repo.audit.map((e) => [e.action, e.configId])).toEqual([
      ["deactivated", a.id],
      ["activated", b.id],
    ]);
  });

  it("returns the decrypted active key only through getActiveCredential", async () => {
    expect(await service.getActiveCredential()).toBeNull();
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    expect(await service.getActiveCredential()).toMatchObject({
      id: a.id,
      provider: "openai",
      model: "gpt-test",
      apiKey: OPENAI_KEY,
    });
  });

  it("never activates a failed or revoked key", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test");
    await repo.updateConfig(a.id, { status: "failed" });
    expect(await service.activate(a.id)).toMatchObject({ ok: false });

    const b = await addOk("deepseek", DEEPSEEK_KEY, "deepseek-chat");
    await service.revoke(b.id);
    expect(await service.activate(b.id)).toMatchObject({ ok: false });
    expect(repo.activeId).toBeNull();
    expect(await service.activate("missing")).toMatchObject({ ok: false });
  });

  it("deactivates, so chat falls back to the environment settings", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    onActiveChanged.mockClear();
    expect(await service.deactivate(a.id)).toMatchObject({ ok: true });
    expect(repo.activeId).toBeNull();
    expect(onActiveChanged).toHaveBeenCalledOnce();
    expect(await service.deactivate(a.id)).toMatchObject({ ok: false });
  });
});

describe("revoking", () => {
  it("destroys the stored key, deactivates it, and keeps the row for the audit", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    repo.audit.length = 0;

    expect(await service.revoke(a.id)).toMatchObject({ ok: true });
    const row = repo.configs.get(a.id)!;
    expect(row.encryptedKey).toBeNull();
    expect(row.status).toBe("revoked");
    expect(repo.activeId).toBeNull();
    expect(repo.audit.map((e) => e.action)).toEqual(["deactivated", "revoked"]);
    expect(await service.reverify(a.id)).toMatchObject({ ok: false });
    expect(await service.changeModel(a.id, "other")).toMatchObject({ ok: false });
  });
});

describe("re-checking", () => {
  it("marks a key failed and deactivates it on a definitive failure", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    verify.mockResolvedValueOnce({ ok: false, reason: "invalid_key" });

    const result = await service.reverify(a.id);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/deactivated/);
    expect(repo.configs.get(a.id)?.status).toBe("failed");
    expect(repo.activeId).toBeNull();
    expect(verify).toHaveBeenLastCalledWith("openai", OPENAI_KEY, "gpt-test");
  });

  it("changes nothing when the provider is only unreachable", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test", true);
    verify.mockResolvedValueOnce({ ok: false, reason: "unreachable" });
    await service.reverify(a.id);
    expect(repo.configs.get(a.id)?.status).toBe("verified");
    expect(repo.activeId).toBe(a.id);
    expect(repo.audit.at(-1)).toMatchObject({
      action: "verification_failed",
      detail: "unreachable",
    });
  });

  it("restores a failed key after a passing check", async () => {
    const a = await addOk("openai", OPENAI_KEY, "gpt-test");
    await repo.updateConfig(a.id, { status: "failed" });
    expect(await service.reverify(a.id)).toEqual({ ok: true, message: "Key verified." });
    expect(repo.configs.get(a.id)?.status).toBe("verified");
  });
});

describe("changing the model", () => {
  it("checks the stored key against the new model before switching", async () => {
    const a = await addOk("gemini", GEMINI_KEY, "gemini-a", true);
    onActiveChanged.mockClear();

    expect(await service.changeModel(a.id, " gemini-b ")).toEqual({
      ok: true,
      message: "Model changed to gemini-b.",
    });
    expect(verify).toHaveBeenLastCalledWith("gemini", GEMINI_KEY, "gemini-b");
    expect(repo.configs.get(a.id)?.model).toBe("gemini-b");
    expect(repo.audit.at(-1)).toMatchObject({
      action: "model_changed",
      model: "gemini-b",
      detail: "from:gemini-a",
    });
    expect(onActiveChanged).toHaveBeenCalledOnce();
  });

  it("keeps the old model when the new one fails", async () => {
    const a = await addOk("gemini", GEMINI_KEY, "gemini-a");
    verify.mockResolvedValueOnce({ ok: false, reason: "model_unavailable" });
    expect(await service.changeModel(a.id, "gemini-x")).toMatchObject({ ok: false });
    expect(repo.configs.get(a.id)?.model).toBe("gemini-a");
    expect(repo.audit.at(-1)).toMatchObject({ action: "verification_failed", model: "gemini-x" });
  });

  it("rejects an invalid model ID", async () => {
    const a = await addOk("gemini", GEMINI_KEY, "gemini-a");
    expect(await service.changeModel(a.id, "no spaces allowed")).toMatchObject({ ok: false });
  });
});

it("never puts a key in the audit trail or the list view", async () => {
  await addOk("openai", OPENAI_KEY, "gpt-test", true);
  const b = await addOk("deepseek", DEEPSEEK_KEY, "deepseek-chat");
  await service.activate(b.id);
  await service.changeModel(b.id, "deepseek-reasoner");
  await service.revoke(b.id);
  const visible = JSON.stringify([await service.list(), await service.listAudit()]);
  for (const key of [OPENAI_KEY, DEEPSEEK_KEY]) {
    expect(visible).not.toContain(key);
    expect(stored()).not.toContain(key);
  }
});
