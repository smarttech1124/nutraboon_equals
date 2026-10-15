import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

/** Provider that returns scripted replies in order and records every request. */
function scripted(replies: AIResponse[]) {
  const requests: AIRequest[] = [];
  const provider: AIProvider = {
    name: "scripted",
    generateResponse: async (req) => {
      requests.push(req);
      const next = replies.shift();
      if (!next) throw new Error("no scripted reply left");
      return next;
    },
  };
  return { provider, requests };
}

const ok = (message: string, recommendedFoods: string[] = []): AIResponse => ({
  message,
  intent: "meal_planning",
  recommendedFoods,
});

describe("allergy enforcement through the chat API", () => {
  let infoLogs: string[];

  beforeEach(() => {
    infoLogs = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => infoLogs.push(line));
  });

  function chat(provider: AIProvider) {
    const POST = createChatHandler({
      getProvider: () => provider,
      store: new InMemoryConversationStore(),
      rateLimiter: new InMemoryRateLimiter(100, 60_000),
    });
    let conversationId: string | undefined;
    return async (message: string) => {
      const res = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ conversationId, message }),
        }),
      );
      const body = await res.json();
      conversationId = body.conversationId;
      return body;
    };
  }

  it("remembers a declared allergy and gives it to the model on later turns", async () => {
    const { provider, requests } = scripted([ok("Thanks, noted."), ok("What do you have?")]);
    const send = chat(provider);

    await send("My youngest is allergic to peanuts.");
    await send("Plan dinner for us.");

    expect(requests[1].systemPrompt).toContain("Declared allergy or food to avoid: peanut");
    expect(requests[1].systemPrompt).toContain("groundnut oil");
  });

  it("flags a conflicting food the user has at home", async () => {
    const { provider, requests } = scripted([
      ok("Noted."),
      ok("Make rice and beans with palm oil.", ["rice", "beans", "palm oil"]),
    ]);
    const send = chat(provider);

    await send("My youngest is allergic to peanuts.");
    const body = await send("We have rice, beans, eggs, plantain and groundnut oil.");

    expect(requests[1].systemPrompt).toContain(
      "The user just mentioned foods that contain a declared allergen: groundnut oil (peanut)",
    );
    expect(body.metadata.allergyNotice).toBe(
      "Heads-up: groundnut oil contains peanut, which you said must be avoided, so it's left out.",
    );
  });

  it("regenerates once with a correction when the reply suggests the allergen", async () => {
    const { provider, requests } = scripted([
      ok("Noted."),
      ok("Fry plantain in groundnut oil.", ["plantain", "groundnut oil"]),
      ok("Fry plantain in palm oil.", ["plantain", "palm oil"]),
    ]);
    const send = chat(provider);

    await send("He can't eat peanuts.");
    const body = await send("What can I cook with plantain?");

    expect(requests).toHaveLength(3);
    expect(requests[2].systemPrompt).toContain(
      "CORRECTION REQUIRED: Your previous reply suggested groundnut oil (contains peanut, a declared allergy)",
    );
    expect(body.message).toBe("Fry plantain in palm oil.");
    expect(body.metadata.allergyNotice).toBe(
      "Leaving out peanut because you said it must be avoided.",
    );
    expect(infoLogs.at(-1)).toContain(
      '"safety":{"violations":2,"regenerated":true,"usedFallback":false}',
    );
  });

  it("replaces the reply with a safe fallback if the correction also fails", async () => {
    const { provider } = scripted([
      ok("Noted."),
      ok("Add groundnut paste.", ["groundnut paste"]),
      ok("Add some kuli kuli.", ["kuli kuli"]),
    ]);
    const send = chat(provider);

    await send("She is allergic to groundnuts.");
    const body = await send("Snack ideas?");

    expect(body.intent).toBe("safety_sensitive");
    expect(body.message).toMatch(/keep this safe for the peanut allergy/);
    expect(body.message).not.toMatch(/kuli kuli|groundnut paste/);
    expect(infoLogs.at(-1)).toContain('"usedFallback":true');
  });

  it("does not log the allergy or food names", async () => {
    const { provider } = scripted([ok("Noted.")]);
    await chat(provider)("My son is allergic to peanuts.");
    expect(infoLogs.join(" ")).not.toMatch(/peanut/i);
  });

  it("leaves conversations without allergies untouched", async () => {
    const { provider, requests } = scripted([ok("Fry it in groundnut oil.", ["groundnut oil"])]);
    const body = await chat(provider)("How do I cook plantain?");

    expect(requests).toHaveLength(1);
    expect(body.message).toBe("Fry it in groundnut oil.");
    expect(body.metadata).toBeUndefined();
  });
});
