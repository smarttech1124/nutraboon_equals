import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SIGN_VIDEOS } from "@/lib/sign/demo-videos";

const allow = vi.fn(async () => true);
vi.mock("@/lib/auth/next", () => ({ allowAttempt: () => allow() }));

const { POST } = await import("@/app/api/sign-language/route");

/** POST /api/sign-language (ADR-077). */

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/sign-language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => allow.mockResolvedValue(true));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sign-language route", () => {
  it("returns a demo response for any supported module", async () => {
    for (const source of ["assistant", "planner", "hospital"]) {
      const res = await post({ text: "Hello", module: source });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.response.kind).toBe("demo");
      expect(body.response.notice).toMatch(/^Demo mode/);
    }
  });

  it("never returns excluded or failed videos, and says when none are left", async () => {
    const ids = DEMO_SIGN_VIDEOS.map((v) => v.id);
    const res = await post({
      text: "x",
      module: "assistant",
      exclude: ids.slice(0, 5),
      failed: ids.slice(5, 9),
    });
    expect((await res.json()).response.video.id).toBe(ids[9]);
    const none = await post({ text: "x", module: "assistant", exclude: ids });
    expect(await none.json()).toEqual({ status: "none" });
  });

  it("logs failed videos by id only, never the reply text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post({ text: "my private question", module: "planner", failed: ["gsl-fufu"] });
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("gsl-fufu");
    expect(logged).not.toContain("private");
  });

  it("rejects bad input and too many requests", async () => {
    expect((await post({ text: "x", module: "admin" })).status).toBe(400);
    expect((await post({ text: "x", module: "assistant", exclude: ["../etc"] })).status).toBe(400);
    allow.mockResolvedValue(false);
    expect((await post({ text: "x", module: "assistant" })).status).toBe(429);
  });

  it("reports unavailable when switched off or set to the unbuilt production provider", async () => {
    vi.stubEnv("SIGN_LANGUAGE_PROVIDER", "off");
    expect(await (await post({ text: "x", module: "assistant" })).json()).toEqual({
      status: "unavailable",
    });
    vi.stubEnv("SIGN_LANGUAGE_PROVIDER", "production");
    expect(await (await post({ text: "x", module: "assistant" })).json()).toEqual({
      status: "unavailable",
    });
  });
});
