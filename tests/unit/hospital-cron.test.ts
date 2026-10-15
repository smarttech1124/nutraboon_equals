import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/hospitals/route";

/** The cron route runs only with the right secret (ADR-068). */
describe("hospital cron authorization", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses every call when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(new Request("http://x/api/cron/hospitals"));
    expect(res.status).toBe(401);
  });

  it("refuses a wrong or missing bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const none = await GET(new Request("http://x/api/cron/hospitals"));
    const wrong = await GET(
      new Request("http://x/api/cron/hospitals", {
        headers: { authorization: "Bearer not-the-secret" },
      }),
    );
    expect(none.status).toBe(401);
    expect(wrong.status).toBe(401);
  });
});
