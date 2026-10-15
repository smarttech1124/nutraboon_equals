import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";

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

const say = (message: string, extra: Partial<AIResponse> = {}): AIResponse => ({
  message,
  intent: "safety_sensitive",
  ...extra,
});

const userContext = (req: AIRequest) =>
  req.systemPrompt.split("CURRENT USER CONTEXT:\n")[1]?.split("\n\n")[0] ?? "";

describe("pregnancy (Journey E)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("detects pregnancy in code, adds the antenatal referral once, and blocks unsafe foods", async () => {
    const { provider, requests } = scripted([
      say("Congratulations! Any foods you need to avoid?"),
      say("Try this.", { recommendedFoods: ["yam", "palm wine"] }),
      say("Try this.", { recommendedFoods: ["yam", "hard boiled egg", "ugu"] }),
    ]);
    const send = chat(provider);

    const first = await send("I'm pregnant, in my first trimester. Plan my meals.");
    expect(userContext(requests[0])).toContain("The user is pregnant, trimester 1.");
    expect(userContext(requests[0])).toContain("Never suggest alcohol (including palm wine)");
    expect(first.metadata.safetyNotice).toMatch(/antenatal clinic, midwife or doctor/);

    const second = await send("No allergies. What can I eat today?");
    expect(requests[2].systemPrompt).toMatch(
      /CORRECTION REQUIRED: .*palm wine \(alcohol is not safe in pregnancy\)/,
    );
    expect(second.message).toBe("Try this.");
    // The referral is not repeated on later turns.
    expect(second.metadata?.safetyNotice).toBeUndefined();
  });

  it("keeps the model's own referral instead of adding the default", async () => {
    const { provider } = scripted([
      say("Congratulations!", { safetyNotice: "Please book an antenatal visit soon." }),
    ]);
    const body = await chat(provider)("I'm 10 weeks pregnant.");
    expect(body.metadata.safetyNotice).toBe("Please book an antenatal visit soon.");
  });
});

describe("medication and medical conditions", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("blocks advice to change medication and falls back to a safe message if repeated", async () => {
    const { provider, requests } = scripted([
      say("Beans are fine. You could reduce your metformin a little."),
      say("Yes, lower your metformin dose when you eat beans."),
    ]);
    const body = await chat(provider)(
      "I have diabetes. Should I reduce my metformin if I eat more beans?",
    );

    expect(userContext(requests[0])).toContain("Medical conditions mentioned: diabetes.");
    expect(userContext(requests[0])).toContain(
      "never suggest starting, stopping or changing any medicine",
    );
    expect(requests).toHaveLength(2);
    expect(body.message).toMatch(/can't advise on medicine doses or changes/);
    expect(body.metadata.safetyNotice).toMatch(
      /registered dietitian can tailor food advice for diabetes/,
    );
    expect(body.metadata.safetyNotice).toMatch(/Keep taking any medicine as prescribed/);
  });

  it("blocks supplement doses", async () => {
    const { provider, requests } = scripted([
      say("Most women take 400 mcg of folic acid daily."),
      say("Your antenatal clinic will advise you on folic acid."),
    ]);
    const body = await chat(provider)("I'm pregnant. How much folic acid should I take?");

    expect(requests[1].systemPrompt).toMatch(/CORRECTION REQUIRED: .*never suggest a dose/);
    expect(body.message).toBe("Your antenatal clinic will advise you on folic acid.");
  });

  it("maps conditions the model reports to known conditions", async () => {
    const { provider, requests } = scripted([
      say("Noted.", { profileUpdate: { conditions: ["high blood pressure"] } }),
      say("Here are ideas."),
    ]);
    const send = chat(provider);
    await send("My dad's pressure is always up.");
    await send("Breakfast ideas for him?");
    expect(userContext(requests[1])).toContain("Medical conditions: high blood pressure.");
  });
});

describe("emergencies", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("shows an urgent-care notice written by the app, whatever the model says", async () => {
    const { provider, requests } = scripted([say("Give him some water and watch him.")]);
    const body = await chat(provider)(
      "My son ate groundnut and now he has difficulty breathing. What should he eat?",
    );

    expect(userContext(requests[0])).toMatch(
      /^- URGENT: the user describes possible emergency signs/,
    );
    expect(body.metadata.urgentNotice).toMatch(
      /nearest hospital or health centre now, or call 112/,
    );
  });

  it("does not raise an alarm for ordinary messages", async () => {
    const { provider } = scripted([say("Here are ideas.", { intent: "general_nutrition" })]);
    const body = await chat(provider)("What's a healthy breakfast?");
    expect(body.metadata?.urgentNotice).toBeUndefined();
  });
});

describe("babies under 6 months", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("never suggests foods when the only person is a baby under 6 months", async () => {
    const { provider, requests } = scripted([
      say("Try thin pap.", {
        recommendedFoods: ["pap"],
        profileUpdate: { members: [{ label: "baby", ageYears: 0.33 }] },
      }),
      say("At this age, breast milk or formula is all your baby needs.", {
        recommendedFoods: [],
        profileUpdate: { members: [{ label: "baby", ageYears: 0.33 }] },
      }),
    ]);
    const body = await chat(provider)("What food can I give my 4-month-old?");

    expect(requests[1].systemPrompt).toMatch(/breast milk or infant formula \(WHO\)/);
    expect(body.message).toMatch(/breast milk or formula/);
    expect(body.metadata.safetyNotice).toMatch(/child welfare clinic/);
  });
});
