import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_CACHE_MS,
  ActiveProviderResolver,
  ERROR_CACHE_MS,
  type ActiveCredential,
} from "@/lib/ai/settings/active";
import type { AIProvider } from "@/lib/ai/types";

const fake = (name: string): AIProvider => ({
  name,
  generateResponse: async () => ({ message: name, intent: "unknown" }),
});

function setup(initial: ActiveCredential | null) {
  let time = 0;
  let active = initial;
  const loadActive = vi.fn(async () => active);
  const build = vi.fn((c: ActiveCredential) => fake(`${c.provider}:${c.model}`));
  const fallback = vi.fn(() => fake("env"));
  const resolver = new ActiveProviderResolver({ loadActive, build, fallback, now: () => time });
  return {
    resolver,
    loadActive,
    build,
    fallback,
    advance: (ms: number) => (time += ms),
    setActive: (c: ActiveCredential | null) => (active = c),
  };
}

const cred = (model: string, updated = 1): ActiveCredential => ({
  id: "cfg",
  provider: "openai",
  model,
  apiKey: "sk-secret",
  updatedAt: new Date(updated),
});

describe("ActiveProviderResolver", () => {
  it("uses the environment provider when nothing is active", async () => {
    const t = setup(null);
    expect((await t.resolver.get()).name).toBe("env");
    expect(t.build).not.toHaveBeenCalled();
  });

  it("builds the active configuration once and caches it", async () => {
    const t = setup(cred("gpt-a"));
    expect((await t.resolver.get()).name).toBe("openai:gpt-a");
    await t.resolver.get();
    expect(t.loadActive).toHaveBeenCalledOnce();
    expect(t.build).toHaveBeenCalledOnce();
  });

  it("picks up a switch made elsewhere after the cache expires", async () => {
    const t = setup(cred("gpt-a"));
    await t.resolver.get();
    t.setActive(cred("gpt-b", 2));
    expect((await t.resolver.get()).name).toBe("openai:gpt-a");
    t.advance(ACTIVE_CACHE_MS);
    expect((await t.resolver.get()).name).toBe("openai:gpt-b");
  });

  it("reuses the built provider when the configuration is unchanged", async () => {
    const t = setup(cred("gpt-a"));
    const first = await t.resolver.get();
    t.advance(ACTIVE_CACHE_MS);
    expect(await t.resolver.get()).toBe(first);
    expect(t.build).toHaveBeenCalledOnce();
  });

  it("applies a change at once after invalidate", async () => {
    const t = setup(cred("gpt-a"));
    await t.resolver.get();
    t.setActive(null);
    t.resolver.invalidate();
    expect((await t.resolver.get()).name).toBe("env");
  });

  it("falls back to the environment on a lookup error, logging no details, and retries soon", async () => {
    const t = setup(cred("gpt-a"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    t.loadActive.mockRejectedValueOnce(
      Object.assign(new Error("db down sk-secret"), { name: "DbError" }),
    );

    expect((await t.resolver.get()).name).toBe("env");
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: "ai_config_unavailable", error: "DbError" }),
    );
    t.advance(ERROR_CACHE_MS);
    expect((await t.resolver.get()).name).toBe("openai:gpt-a");
    log.mockRestore();
  });
});
