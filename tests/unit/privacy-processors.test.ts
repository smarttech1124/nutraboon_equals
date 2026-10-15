import { describe, expect, it } from "vitest";
import { currentAIServices } from "@/lib/privacy/processors";

describe("currentAIServices without saved settings", () => {
  it("names Gemini for the environment settings, and nothing in demo mode", async () => {
    expect(await currentAIServices({})).toEqual(["Google (Gemini)"]);
    expect(await currentAIServices({ AI_PROVIDER: "mock" })).toEqual([]);
  });
});
