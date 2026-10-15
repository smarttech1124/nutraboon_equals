import { afterEach, describe, expect, it, vi } from "vitest";
import { getSignProvider, signProviderSetting } from "@/lib/sign";
import { DemoSignProvider } from "@/lib/sign/demo-provider";
import { DEMO_SIGN_VIDEOS } from "@/lib/sign/demo-videos";
import { ProductionSignProvider } from "@/lib/sign/production-provider";
import { DEMO_NOTICE } from "@/lib/sign/types";

/** Sign-language response simulation (ADR-077). */

describe("demo video collection", () => {
  it("has about 10 verified videos, each under 60 seconds", () => {
    expect(DEMO_SIGN_VIDEOS.length).toBeGreaterThanOrEqual(8);
    expect(DEMO_SIGN_VIDEOS.length).toBeLessThanOrEqual(12);
    for (const v of DEMO_SIGN_VIDEOS) {
      expect(v.durationSeconds).toBeGreaterThan(0);
      expect(v.durationSeconds).toBeLessThan(60);
    }
  });

  it("records language, licence and source, and plays from Wikimedia over https", () => {
    expect(new Set(DEMO_SIGN_VIDEOS.map((v) => v.id)).size).toBe(DEMO_SIGN_VIDEOS.length);
    for (const v of DEMO_SIGN_VIDEOS) {
      expect(v.language).toMatch(/Sign Language$/);
      expect(v.attribution.author).not.toBe("");
      expect(v.attribution.license).toMatch(/^(CC0|CC BY-SA [34]\.0|CC BY [34]\.0)$/);
      expect(v.attribution.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(v.attribution.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(v.sources.length).toBeGreaterThan(0);
      for (const s of v.sources) expect(new URL(s.src).hostname).toBe("upload.wikimedia.org");
    }
  });

  it("leads with Nigerian Sign Language", () => {
    expect(DEMO_SIGN_VIDEOS[0]!.language).toBe("Nigerian Sign Language");
    expect(
      DEMO_SIGN_VIDEOS.filter((v) => v.language === "Nigerian Sign Language").length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("DemoSignProvider", () => {
  const request = { text: "What's in an orange?", module: "assistant" as const, exclude: [] };

  it("returns a random video with the demo notice, whatever the question", async () => {
    const first = await new DemoSignProvider(DEMO_SIGN_VIDEOS, () => 0).respond(request);
    const last = await new DemoSignProvider(DEMO_SIGN_VIDEOS, () => 0.999).respond({
      ...request,
      text: "Book a hospital appointment",
      module: "hospital",
    });
    expect(first).toMatchObject({ kind: "demo", notice: DEMO_NOTICE, video: DEMO_SIGN_VIDEOS[0] });
    expect(last?.video).toBe(DEMO_SIGN_VIDEOS.at(-1));
  });

  it("varies across calls", async () => {
    const provider = new DemoSignProvider();
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add((await provider.respond(request))!.video.id);
    expect(ids.size).toBeGreaterThan(3);
  });

  it("skips excluded videos and returns null when none are left", async () => {
    const provider = new DemoSignProvider();
    const allButOne = DEMO_SIGN_VIDEOS.slice(1).map((v) => v.id);
    for (let i = 0; i < 10; i++) {
      expect((await provider.respond({ ...request, exclude: allButOne }))?.video.id).toBe(
        DEMO_SIGN_VIDEOS[0]!.id,
      );
    }
    expect(
      await provider.respond({ ...request, exclude: DEMO_SIGN_VIDEOS.map((v) => v.id) }),
    ).toBeNull();
  });
});

describe("provider selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the demo provider by default", () => {
    expect(signProviderSetting({})).toBe("demo");
    expect(getSignProvider({})?.id).toBe("demo");
    expect(getSignProvider({ SIGN_LANGUAGE_PROVIDER: "nonsense" })?.id).toBe("demo");
  });

  it("can be switched off, or to the reserved production provider (not yet available)", async () => {
    expect(getSignProvider({ SIGN_LANGUAGE_PROVIDER: "off" })).toBeNull();
    const production = getSignProvider({ SIGN_LANGUAGE_PROVIDER: "production" });
    expect(production).toBeInstanceOf(ProductionSignProvider);
    expect(production?.available).toBe(false);
    expect(await production?.respond({ text: "x", module: "assistant", exclude: [] })).toBeNull();
  });
});
