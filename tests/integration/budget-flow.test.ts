import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIRequest, AIResponse } from "@/lib/ai/types";
import { roundNaira } from "@/lib/budget/calculate";
import type { PriceLookup } from "@/lib/budget/service";
import { InMemoryConversationStore } from "@/lib/conversation/store";
import { createChatHandler } from "@/lib/http/chat-handler";
import { InMemoryRateLimiter } from "@/lib/http/rate-limit";
import { estimate, priceService } from "../helpers/seed-prices";

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

function chat(provider: AIProvider, prices: PriceLookup | undefined = priceService()) {
  const POST = createChatHandler({
    getProvider: () => provider,
    getPrices: () => prices,
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

const ask = (message: string, profileUpdate?: AIResponse["profileUpdate"]): AIResponse => ({
  message,
  intent: "budget_planning",
  ...(profileUpdate ? { profileUpdate } : {}),
});

const userContext = (req: AIRequest) =>
  req.systemPrompt.split("CURRENT USER CONTEXT:\n")[1]?.split("\n\n")[0] ?? "";

describe("budget planning (Journey C)", () => {
  let infoLogs: string[];

  beforeEach(() => {
    infoLogs = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => infoLogs.push(line));
  });

  it("asks home food, then people, then meal period, then prices the shopping list in code", async () => {
    const { provider, requests } = scripted([
      ask("What food do you already have at home?"),
      ask("How many people are you feeding?", { availableIngredients: ["beans", "palm oil"] }),
      ask("Is this for one meal or the whole day?", { householdSize: 1 }),
      {
        message: "Make beans and garri with a simple stew.",
        intent: "budget_planning",
        profileUpdate: { mealPeriod: "one_meal" },
        recommendedFoods: ["beans", "garri", "tomatoes", "palm oil"],
        fromHome: ["beans", "palm oil"],
        shoppingList: [
          { item: "garri", quantity: 0.5 },
          { item: "tomatoes", quantity: 0.25 },
        ],
      },
    ]);
    const send = chat(provider);

    await send("I have ₦2,000. What can I eat today?");
    await send("Beans and palm oil.");
    await send("Just me.");
    const final = await send("One meal tonight.");

    expect(userContext(requests[0])).toContain("The user has a food budget of ₦2,000.");
    expect(userContext(requests[0])).toMatch(
      /still unknown in priority order: what food they already have/,
    );
    // Facts in a reply's profileUpdate reach the prompt from the next turn on.
    expect(userContext(requests[2])).toMatch(
      /still unknown in priority order: who they are feeding and how old they are/,
    );
    expect(userContext(requests[3])).toMatch(
      /still unknown in priority order: whether the money is for one meal/,
    );
    expect(requests[0].systemPrompt).toContain("national average, NBS Selected Food Price Watch");

    const shown =
      roundNaira(estimate("garri-white-1kg") * 0.5) + roundNaira(estimate("tomatoes-1kg") * 0.25);
    expect(final.metadata.budget).toMatchObject({
      budget: 2000,
      regionLabel: "national average",
      fromHome: ["beans", "palm oil"],
      estimatedTotal: shown,
      estimatedRemaining: 2000 - shown,
      unpriced: [],
    });
    expect(final.metadata.budget.purchases.map((p: { name: string }) => p.name)).toEqual([
      "White garri",
      "Tomatoes",
    ]);
  });

  it("uses the user's zone when they say where they live", async () => {
    const { provider, requests } = scripted([
      {
        message: "Here is what to buy.",
        intent: "budget_planning",
        shoppingList: [{ item: "beans", quantity: 1 }],
      },
    ]);
    const body = await chat(provider)("I live in Lagos and I have ₦3,000 for beans.");

    expect(requests[0].systemPrompt).toContain("South West average");
    expect(userContext(requests[0])).toContain(
      "Location: Lagos (prices use the South West average)",
    );
    expect(body.metadata.budget.regionLabel).toBe("South West average");
    expect(body.metadata.budget.estimatedTotal).toBe(
      roundNaira(estimate("beans-brown-1kg", "south_west")),
    );
  });

  it("regenerates a shopping list that goes over budget", async () => {
    const { provider, requests } = scripted([
      {
        message: "Buy these.",
        intent: "budget_planning",
        shoppingList: [{ item: "eggs", quantity: 2 }],
      },
      {
        message: "Buy these.",
        intent: "budget_planning",
        shoppingList: [{ item: "eggs", quantity: 0.2 }],
      },
    ]);
    const body = await chat(provider)("I have ₦2,000 for eggs.");

    expect(requests[1].systemPrompt).toMatch(/CORRECTION REQUIRED: .*over the ₦2,000 budget/);
    expect(body.metadata.budget.estimatedRemaining).toBeGreaterThanOrEqual(0);
  });

  it("rejects money amounts the model made up", async () => {
    const { provider, requests } = scripted([
      { message: "Rice and stew will cost about ₦1,450 in total.", intent: "budget_planning" },
      {
        message: "Rice and stew is a good choice; the app will show the estimate.",
        intent: "budget_planning",
      },
    ]);
    const body = await chat(provider)("I have ₦2,000. What can I cook?");

    expect(requests[1].systemPrompt).toMatch(
      /CORRECTION REQUIRED: Your previous reply suggested ₦1,450/,
    );
    expect(body.message).not.toContain("₦1,450");
  });

  it("allows quoting the user's budget and a provided estimate", async () => {
    const garri = roundNaira(estimate("garri-white-1kg")).toLocaleString("en-NG");
    const { provider, requests } = scripted([
      {
        message: `With ₦2,000, garri is a good buy at about ₦${garri} per kg (estimate).`,
        intent: "budget_planning",
      },
    ]);
    await chat(provider)("I have ₦2,000. Is garri a good buy?");
    expect(requests).toHaveLength(1);
  });

  it("lists items without an estimate separately and leaves them out of the total", async () => {
    const { provider } = scripted([
      {
        message: "Buy rice and onions.",
        intent: "budget_planning",
        shoppingList: [
          { item: "rice", quantity: 1 },
          { item: "onions", quantity: 0.25 },
        ],
      },
    ]);
    const body = await chat(provider)("I have ₦2,000, what should I buy?");

    expect(body.metadata.budget.unpriced).toEqual(["rice"]);
    expect(body.metadata.budget.estimatedTotal).toBe(roundNaira(estimate("onions-1kg") * 0.25));
  });

  it("checks shopping lists against declared allergies", async () => {
    const { provider } = scripted([
      ask("Noted."),
      {
        message: "Buy oil.",
        intent: "budget_planning",
        shoppingList: [{ item: "groundnut oil", quantity: 1 }],
      },
      {
        message: "Buy oil.",
        intent: "budget_planning",
        shoppingList: [{ item: "palm oil", quantity: 1 }],
      },
    ]);
    const send = chat(provider);
    await send("My son is allergic to peanuts.");
    const body = await send("I have ₦5,000. What oil should I buy?");

    expect(body.metadata.budget.purchases.map((p: { name: string }) => p.name)).toEqual([
      "Palm oil",
    ]);
  });

  it("still answers without prices when the price data is unavailable", async () => {
    const broken: PriceLookup = {
      priceBook: async () => {
        throw new Error("connection refused");
      },
    };
    const { provider, requests } = scripted([
      {
        message: "Use your beans first.",
        intent: "budget_planning",
        shoppingList: [{ item: "garri", quantity: 1 }],
      },
    ]);
    const body = await chat(provider, broken)("I have ₦2,000. What can I cook?");

    expect(requests[0].systemPrompt).not.toContain("NBS Selected Food Price Watch");
    expect(body.metadata?.budget).toBeUndefined();
    expect(infoLogs.at(-1)).toContain('"degraded":["prices_unavailable"]');
  });
});
