import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import type { AIProvider } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

/**
 * Phase 1 safety coverage: the policy text every provider receives, and that
 * safety metadata survives the pipeline. Deterministic enforcement (allergy
 * filtering, meal-plan validation) arrives in Phase 5 with its own tests.
 */
describe("safety policy in the system prompt", () => {
  const prompt = buildSystemPrompt().toLowerCase();

  it.each([
    ["diagnosis", "never diagnose"],
    ["medication and supplement doses", "medication or supplement doses"],
    ["pregnancy", "pregnancy"],
    ["children under 5", "children under 5"],
    ["infant feeding", "infant-feeding"],
    ["allergies", "never suggest that food"],
    ["medical conditions", "diabetes, kidney disease"],
    ["medication interactions", "medication interactions"],
    ["emergencies", "urgent medical care"],
    ["professional referral", "qualified health professional"],
  ])("covers %s", (_label, phrase) => {
    expect(prompt).toContain(phrase);
  });

  it("forbids invented nutrition values and unlabelled prices", () => {
    expect(prompt).toContain("do not invent exact nutrition values");
    expect(prompt).toContain("labelled as an estimate");
  });

  it("matches referrals to the person and never sends a child to an antenatal clinic", () => {
    expect(prompt).toContain("babies and children → child welfare clinic");
    expect(prompt).toContain("never suggest an antenatal clinic for a child");
  });

  it("keeps disclaimers out of the message and referrals in safetyNotice", () => {
    expect(prompt).toContain("put the professional-care referral in safetynotice, not in message");
    expect(prompt).toContain('do not repeat "i am not a doctor"');
  });

  it("asks for one question at a time", () => {
    expect(prompt).toContain("at most one follow-up question");
  });
});

describe("safety metadata through the chat API", () => {
  it("returns the safety notice and intent for a pregnancy request", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const provider: AIProvider = {
      name: "fake",
      generateResponse: async () => ({
        intent: "safety_sensitive",
        message: "Congratulations! Do you have any food allergies?",
        followUpQuestion: "Do you have any food allergies?",
        safetyNotice: "Your antenatal clinic can give advice for your situation.",
      }),
    };
    const POST = createChatHandler({
      getProvider: () => provider,
      store: new InMemoryConversationStore(),
      rateLimiter: new InMemoryRateLimiter(10, 60_000),
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "I'm pregnant, first trimester. Make me a meal plan." }),
      }),
    );
    const body = await res.json();

    expect(body.intent).toBe("safety_sensitive");
    expect(body.metadata.safetyNotice).toMatch(/antenatal/);
  });
});
