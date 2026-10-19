import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's background work and database are replaced; this tests the HTTP contract.
const afterTasks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => afterTasks.push(task) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
const handleIncoming = vi.fn(async () => {});
const handleStatuses = vi.fn(async () => {});
vi.mock("@/lib/whatsapp/service", () => ({ handleIncoming, handleStatuses }));

// Imported once (after the mocks above, which vitest hoists); settings are read per request.
const { GET, POST } = await import("@/app/api/whatsapp/webhook/route");

const ENV = {
  WHATSAPP_ACCESS_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-me",
};

const url = "http://localhost/api/whatsapp/webhook";
const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messages: [
              { from: "2348012345678", id: "wamid.1", type: "text", text: { body: "Hi" } },
            ],
          },
        },
      ],
    },
  ],
});
const sign = (body: string, secret = "app-secret") =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("WhatsApp webhook route (ADR-087)", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    afterTasks.length = 0;
    handleIncoming.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers Meta's verification handshake only with the right token", async () => {
    const ok = await GET(
      new Request(`${url}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const wrong = await GET(
      new Request(`${url}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`),
    );
    expect(wrong.status).toBe(403);
  });

  it("rejects unsigned or wrongly signed posts", async () => {
    const unsigned = await POST(new Request(url, { method: "POST", body: payload }));
    expect(unsigned.status).toBe(401);
    const wrong = await POST(
      new Request(url, {
        method: "POST",
        body: payload,
        headers: { "x-hub-signature-256": sign(payload, "attacker") },
      }),
    );
    expect(wrong.status).toBe(401);
    expect(afterTasks).toHaveLength(0);
    const reasons = vi
      .mocked(console.warn)
      .mock.calls.map((c) => JSON.parse(String(c[0])).reason as string);
    expect(reasons).toEqual(["missing", "mismatch"]);
  });

  it("acknowledges a signed post at once and handles messages afterwards", async () => {
    const res = await POST(
      new Request(url, {
        method: "POST",
        body: payload,
        headers: { "x-hub-signature-256": sign(payload) },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleIncoming).not.toHaveBeenCalled();
    await afterTasks[0]!();
    expect(handleIncoming).toHaveBeenCalledWith(
      { from: "2348012345678", id: "wamid.1", text: "Hi" },
      expect.objectContaining({ hashSecret: expect.any(String) }),
    );
  });

  it("is switched off (404) until WhatsApp is configured", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect((await GET(new Request(url))).status).toBe(404);
    expect((await POST(new Request(url, { method: "POST", body: payload }))).status).toBe(404);
  });
});
