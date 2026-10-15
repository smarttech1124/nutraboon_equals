import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackProvider } from "@/lib/ai/fallback";
import { createCredentialCipher } from "@/lib/ai/settings/crypto";
import type { AuditEventInput } from "@/lib/ai/settings/types";
import { AIProviderError, type AIProvider } from "@/lib/ai/types";
import {
  composeXeelaaMessage,
  describeXeelaaFailure,
  fetchXeelaaUsage,
  flattenUsage,
  replyText,
  verifyXeelaaKey,
  XeelaaProvider,
  type XeelaaCheck,
} from "@/lib/xeelaa/client";
import { InMemoryXeelaaRepository, XeelaaService } from "@/lib/xeelaa/service";

const KEY = "xla_k1d2e3:s3cr3tS3cr3tS3cr3t9Z";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const request = {
  systemPrompt: "SYSTEM",
  messages: [
    { role: "user" as const, content: "Hi" },
    { role: "assistant" as const, content: "Hello" },
    { role: "user" as const, content: "Oranges?" },
  ],
};
const reply = { message: "Oranges are rich in vitamin C.", intent: "food_information" };

describe("XEELAA client", () => {
  it("verifies the key with an authenticated call, as a Bearer token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ success: true, data: {} }));
    expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    // /api/v2/verify answers 200 even without a key, so it cannot check one.
    expect(url).toBe("https://xeelaa.com/api/v2/usage");
    expect(String(url)).not.toContain(KEY);
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
  });

  it.each([
    [401, "invalid_key"],
    [403, "invalid_key"],
    [429, "rate_limited"],
  ] as const)("treats HTTP %i on /usage as final: %s", async (status, reason) => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}, status));
    expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({ ok: false, reason, status });
    expect(fetchMock).toHaveBeenCalledOnce(); // a clear answer about the key needs no second try
  });

  it.each([
    [500, "server_error"],
    [503, "server_error"],
    [504, "timeout"],
    [400, "rejected"],
  ] as const)(
    "tries /me after HTTP %i on /usage, and reports %s if both fail",
    async (status, reason) => {
      const fetchMock = vi.fn<typeof fetch>(async () => json({}, status));
      expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({ ok: false, reason, status });
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://xeelaa.com/api/v2/usage",
        "https://xeelaa.com/api/v2/me",
      ]);
    },
  );

  it("accepts the key when /usage fails but /me succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ success: false, message: "Server Error" }, 500))
      .mockResolvedValueOnce(json({ success: true, data: { name: "Ada" } }));
    expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({ ok: true });
  });

  it("rejects the key when /usage fails and /me says it is invalid", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }))
      .mockResolvedValueOnce(json({ success: false }, 401));
    expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({
      ok: false,
      reason: "invalid_key",
      status: 401,
    });
  });

  it("treats a success: false body as a rejected key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ success: false, message: "Invalid or expired API key." }),
    );
    expect(await verifyXeelaaKey(KEY, fetchMock)).toEqual({
      ok: false,
      reason: "invalid_key",
      status: 200,
    });
  });

  it("tells a time-out apart from no connection, and logs no key", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => logs.push(line));
    const timeout = vi.fn<typeof fetch>(async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      });
    });
    expect(await verifyXeelaaKey(KEY, timeout)).toEqual({ ok: false, reason: "timeout" });

    const offline = vi.fn<typeof fetch>(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    });
    expect(await verifyXeelaaKey(KEY, offline)).toEqual({ ok: false, reason: "network" });

    expect(JSON.parse(logs.at(-1)!)).toMatchObject({
      event: "xeelaa_check",
      endpoint: "/api/v2/me",
      error: "TypeError",
      code: "ENOTFOUND",
    });
    expect(logs.join("\n")).not.toContain(KEY);
    vi.restoreAllMocks();
  });

  it("names the HTTP status in the admin message", () => {
    expect(describeXeelaaFailure({ reason: "server_error", status: 500 })).toBe(
      "XEELAA had a server error. Nothing was changed; try again later, or contact XEELAA if it continues. (XEELAA answered HTTP 500.)",
    );
    expect(describeXeelaaFailure({ reason: "network" })).toMatch(/^Could not connect to XEELAA/);
  });

  it("shows usage figures but never a field that could hold a credential", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        data: {
          requests_today: 42,
          rate_limit: { per_minute: 120, remaining: 118 },
          tier: "pro",
          api_key: KEY,
          key_secret: "x",
          token: "y",
          webhooks: ["a"],
        },
      }),
    );
    const usage = await fetchXeelaaUsage(KEY, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe("https://xeelaa.com/api/v2/usage");
    expect(usage).toEqual({
      ok: true,
      items: [
        { label: "requests today", value: "42" },
        { label: "rate limit per minute", value: "120" },
        { label: "rate limit remaining", value: "118" },
        { label: "tier", value: "pro" },
      ],
    });
    expect(JSON.stringify(usage)).not.toContain(KEY);
  });

  it("caps the number of usage items", () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`n${i}`, i]));
    expect(flattenUsage(many)).toHaveLength(20);
  });

  it("finds the reply text in the usual places", () => {
    expect(replyText({ response: "a" })).toBe("a");
    expect(replyText({ data: { message: "b" } })).toBe("b");
    expect(replyText({ choices: [{ message: { content: "c" } }] })).toBe("c");
    expect(replyText({ data: {} })).toBeUndefined();
  });

  it("puts the layered prompt, the conversation and the JSON contract in one message", () => {
    const message = composeXeelaaMessage(request);
    expect(message.startsWith("SYSTEM")).toBe(true);
    expect(message).toContain("USER: Hi\nASSISTANT: Hello\nUSER: Oranges?");
    expect(message).toContain("OUTPUT FORMAT: reply with only one JSON object");
  });
});

describe("XeelaaProvider", () => {
  it("posts to /api/v2/ai/chat and validates the JSON reply, even inside a code fence", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ data: { response: "```json\n" + JSON.stringify(reply) + "\n```" } }),
    );
    const provider = new XeelaaProvider(KEY, fetchMock);
    expect(await provider.generateResponse(request)).toEqual(reply);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://xeelaa.com/api/v2/ai/chat?search_web=false&reasoning=false");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ message: composeXeelaaMessage(request) });
  });

  it("fails on HTTP errors and on replies that are not valid JSON", async () => {
    const rejected = new XeelaaProvider(
      KEY,
      vi.fn<typeof fetch>(async () => json({}, 401)),
    );
    const error = await rejected.generateResponse(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as { cause: { status: number } }).cause.status).toBe(401);

    const prose = new XeelaaProvider(
      KEY,
      vi.fn<typeof fetch>(async () => json({ response: "Oranges are great!" })),
    );
    await expect(prose.generateResponse(request)).rejects.toMatchObject({
      category: "invalid_output",
    });
  });
});

describe("FallbackProvider", () => {
  const fallback: AIProvider = {
    name: "gemini",
    generateResponse: vi.fn(async () => ({ message: "from fallback", intent: "unknown" as const })),
  };

  beforeEach(() => vi.mocked(fallback.generateResponse).mockClear());

  it("uses the primary when it works", async () => {
    const primary: AIProvider = {
      name: "xeelaa",
      generateResponse: async () => ({ ...reply, intent: "food_information" }),
    };
    const provider = new FallbackProvider(primary, fallback, { state: { skipUntil: 0 } });
    expect((await provider.generateResponse(request)).message).toBe(reply.message);
    expect(provider.name).toBe("xeelaa>gemini");
    expect(fallback.generateResponse).not.toHaveBeenCalled();
  });

  it("answers with the fallback on failure, logs no content, then skips the primary for a while", async () => {
    let time = 1_000;
    const primary: AIProvider = {
      name: "xeelaa",
      generateResponse: vi.fn(async () => {
        throw new AIProviderError("XEELAA request failed", "provider", {
          cause: Object.assign(new Error("HTTP 401 for Oranges?"), { status: 401 }),
        });
      }),
    };
    const onPrimaryFailure = vi.fn();
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => logs.push(line));
    const provider = new FallbackProvider(primary, fallback, {
      state: { skipUntil: 0 },
      onPrimaryFailure,
      now: () => time,
      cooldownMs: 60_000,
    });

    expect((await provider.generateResponse(request)).message).toBe("from fallback");
    expect(onPrimaryFailure).toHaveBeenCalledOnce();
    expect(JSON.parse(logs[0])).toEqual({
      event: "ai_primary_fallback",
      from: "xeelaa",
      to: "gemini",
      category: "provider",
      status: 401,
    });
    expect(logs[0]).not.toContain("Oranges");

    await provider.generateResponse(request);
    expect(primary.generateResponse).toHaveBeenCalledOnce(); // cooling down
    time += 60_000;
    await provider.generateResponse(request);
    expect(primary.generateResponse).toHaveBeenCalledTimes(2);
  });
});

describe("XeelaaService", () => {
  let repo: InMemoryXeelaaRepository;
  let verify: ReturnType<typeof vi.fn<(key: string) => Promise<XeelaaCheck>>>;
  let audit: AuditEventInput[];
  let onChanged: ReturnType<typeof vi.fn<() => void>>;
  let service: XeelaaService;

  beforeEach(() => {
    repo = new InMemoryXeelaaRepository();
    verify = vi.fn(async () => ({ ok: true }) as XeelaaCheck);
    audit = [];
    onChanged = vi.fn<() => void>();
    service = new XeelaaService({
      repo,
      cipher: createCredentialCipher(randomBytes(32)),
      verify,
      usage: async () => ({ ok: true, items: [] }),
      audit: async (e) => void audit.push(e),
      onChanged,
    });
  });

  it("verifies before saving, stores the key encrypted and starts switched off", async () => {
    expect(await service.saveKey(` ${KEY} `)).toMatchObject({ ok: true });
    expect(verify).toHaveBeenCalledWith(KEY);
    expect(JSON.stringify(repo.record)).not.toContain(KEY);
    expect(await service.view()).toMatchObject({
      configured: true,
      keyHint: "xla_••••••••3t9Z",
      enabled: false,
      status: "verified",
      active: false,
    });
    expect(await service.getActiveKey()).toBeNull();
    expect(audit.map((e) => [e.action, e.provider])).toEqual([
      ["verification_succeeded", "xeelaa"],
      ["credential_added", "xeelaa"],
    ]);
  });

  it("rejects a malformed key without calling XEELAA, and stores nothing when verification fails", async () => {
    expect(await service.saveKey("sk-not-xeelaa")).toMatchObject({ ok: false });
    expect(verify).not.toHaveBeenCalled();
    verify.mockResolvedValueOnce({ ok: false, reason: "invalid_key" });
    expect(await service.saveKey(KEY)).toEqual({
      ok: false,
      error: "XEELAA rejected this key. It may be wrong, expired or revoked.",
    });
    expect(repo.record).toBeNull();
    expect(audit).toEqual([
      expect.objectContaining({ action: "verification_failed", detail: "invalid_key" }),
    ]);
    expect(JSON.stringify(audit)).not.toContain(KEY);
  });

  it("switches on only after a fresh check, and off at any time", async () => {
    expect(await service.setEnabled(true)).toMatchObject({ ok: false }); // no key yet
    await service.saveKey(KEY);
    expect(await service.setEnabled(true)).toMatchObject({ ok: true });
    expect(await service.getActiveKey()).toBe(KEY);
    expect((await service.view()).active).toBe(true);

    expect(await service.setEnabled(false)).toMatchObject({ ok: true });
    expect(await service.getActiveKey()).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("stays off when the key fails the check at switch-on", async () => {
    await service.saveKey(KEY);
    verify.mockResolvedValueOnce({ ok: false, reason: "invalid_key" });
    expect(await service.setEnabled(true)).toMatchObject({ ok: false });
    expect(await service.view()).toMatchObject({
      enabled: false,
      status: "invalid",
      lastError: "invalid_key",
    });
  });

  it("marks the key invalid when chat is refused, so chat stops trying it", async () => {
    await service.saveKey(KEY);
    await service.setEnabled(true);
    await service.reportChatFailure(503); // a blip changes nothing
    expect(await service.getActiveKey()).toBe(KEY);

    await service.reportChatFailure(401);
    expect(await service.getActiveKey()).toBeNull();
    expect(await service.view()).toMatchObject({
      enabled: true,
      status: "invalid",
      active: false,
      lastError: "invalid_key",
    });
    expect(audit.at(-1)).toMatchObject({
      action: "verification_failed",
      detail: "chat:invalid_key",
    });

    // A passing re-check brings it back.
    expect(await service.recheck()).toMatchObject({ ok: true });
    expect(await service.getActiveKey()).toBe(KEY);
  });

  it("deletes the key and switches off", async () => {
    await service.saveKey(KEY);
    await service.setEnabled(true);
    expect(await service.removeKey()).toMatchObject({ ok: true });
    expect(repo.record?.encryptedKey).toBeNull();
    expect(await service.view()).toMatchObject({ configured: false, active: false });
    expect(audit.at(-1)).toMatchObject({ action: "revoked" });
  });

  it("keeps the switch position when the key is replaced", async () => {
    await service.saveKey(KEY);
    await service.setEnabled(true);
    await service.saveKey("xla_newkey:anotherSecretValue12");
    expect(await service.getActiveKey()).toBe("xla_newkey:anotherSecretValue12");
  });
});
