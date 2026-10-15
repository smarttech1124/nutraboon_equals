import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

function chat() {
  const requests: AIRequest[] = [];
  const provider: AIProvider = {
    name: "scripted",
    generateResponse: async (req) => {
      requests.push(req);
      return {
        message: "Aim for a deep latch: wide mouth, chin first, lower lip turned out.",
        intent: "general_nutrition",
      };
    },
  };
  const POST = createChatHandler({
    getProvider: () => provider,
    store: new InMemoryConversationStore(),
    rateLimiter: new InMemoryRateLimiter(100, 60_000),
  });
  let conversationId: string | undefined;
  const send = async (message: string) => {
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
  return { send, requests };
}

describe("visual explanations in chat (ADR-085)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("attaches reviewed pictures and tells the AI they will be shown", async () => {
    const { send, requests } = chat();
    const reply = await send("I don't understand this nipple latch. Can I see it visually?");
    expect(reply.metadata.visuals.map((v: { id: string }) => v.id)).toEqual([
      "latch-good",
      "latch-compare",
    ]);
    expect(requests[0]!.systemPrompt).toContain("The app will show these reviewed pictures");
    expect(requests[0]!.systemPrompt).toContain('"A good, deep latch"');
  });

  it("asks for a clear written explanation when no reviewed picture exists", async () => {
    const { send, requests } = chat();
    const reply = await send("Can you show me a picture of a kidney?");
    expect(reply.metadata?.visuals).toBeUndefined();
    expect(requests[0]!.systemPrompt).toContain("no reviewed picture is available");
  });

  it("adds no pictures and no picture instructions to ordinary questions", async () => {
    const { send, requests } = chat();
    const reply = await send("How do I get a good latch?");
    expect(reply.metadata?.visuals).toBeUndefined();
    expect(requests[0]!.systemPrompt).not.toContain("picture");
  });
});
