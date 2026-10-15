// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));
import { SETTINGS_KEY } from "@/components/chat/useSettings";
import { installFakeSpeech, uninstallFakeSpeech } from "../helpers/fake-speech";

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  uninstallFakeSpeech();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openChat() {
  const user = userEvent.setup();
  render(
    <GlobalAssistant>
      <HomePage />
    </GlobalAssistant>,
  );
  await user.click(screen.getByRole("button", { name: /ask nutraboom equals/i, expanded: false }));
  return { user, dialog: screen.getByRole("dialog", { name: "Nutraboom Equals" }) };
}

const planReply = {
  conversationId: "c1",
  message: "Here is your plan. Want a cheaper dinner?",
  intent: "budget_planning",
  metadata: {
    outcome: {
      kind: "meal_plan",
      title: "Your ₦2,000 meal plan",
      subtitle: "For 3 people • 1 day",
      mealCosts: { "0:0": 450 },
      nutritionFocus: [
        { nutrient: "Protein", foods: ["Egg", "Beans, boiled"] },
        { nutrient: "Vitamin A", foods: ["Palm oil, red"] },
      ],
    },
    mealPlan: {
      days: [
        {
          day: "Day 1",
          meals: [
            { mealType: "breakfast", name: "Pap and egg", foods: ["ogi", "egg"] },
            { mealType: "dinner", name: "Beans and plantain", foods: ["beans", "plantain"] },
          ],
        },
      ],
    },
    budget: {
      budget: 2000,
      region: "national",
      regionLabel: "National average",
      priceSource: "NBS Selected Food Price Watch, May 2026",
      priceSourceUrl: "https://example.org/nbs",
      fromHome: ["beans"],
      purchases: [
        {
          name: "Eggs",
          quantity: "0.1",
          unitLabel: "crate of 30",
          estimatedCost: 450,
          forMeal: "Pap and egg",
        },
      ],
      unpriced: [],
      estimatedTotal: 450,
      estimatedRemaining: 1550,
    },
  },
};

describe("outcome card", () => {
  it("leads with the structured result, then the conversation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(planReply));
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Plan{Enter}");

    const card = await within(dialog).findByRole("article", { name: "Your ₦2,000 meal plan" });
    expect(
      within(card).getByRole("heading", { name: "Your ₦2,000 meal plan" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("For 3 people • 1 day")).toBeInTheDocument();
    expect(within(card).getByText("Estimated total ₦450 • ₦1,550 left")).toBeInTheDocument();
    expect(within(card).getByText("Pap and egg")).toBeInTheDocument();
    expect(within(card).getByText("Estimated cost to buy: about ₦450")).toBeInTheDocument();
    expect(within(card).getByText("Shopping list (estimated prices)")).toBeInTheDocument();
    expect(within(card).getByText("Budget summary")).toBeInTheDocument();
    const focus = within(card).getByRole("region", { name: "Nutrition focus" });
    expect(focus).toHaveTextContent("Protein from Egg, Beans, boiled");

    // The model's text follows the card.
    const text = within(dialog).getByText("Here is your plan. Want a cheaper dinner?");
    expect(card.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows per-serving facts for a food question", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Oranges are rich in vitamin C.",
        intent: "food_information",
        metadata: {
          outcome: {
            kind: "food_facts",
            title: "Orange at a glance",
            foodFacts: [
              {
                name: "Orange",
                amount: "1 medium (about 140 g)",
                nutrients: [
                  { label: "Energy", value: 66, unit: "kcal" },
                  { label: "Vitamin C", value: 74, unit: "mg" },
                ],
                richIn: ["Vitamin C"],
              },
            ],
          },
        },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Orange?{Enter}");
    const card = await within(dialog).findByRole("article", { name: "Orange at a glance" });
    expect(within(card).getByText("66 kcal")).toBeInTheDocument();
    expect(within(card).getByText(/richer foods in our data for: Vitamin C/)).toBeInTheDocument();
  });

  it("reads the outcome summary aloud before the text", async () => {
    const { spoken } = installFakeSpeech();
    fetchMock.mockResolvedValueOnce(jsonResponse(planReply));
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Plan{Enter}");
    await within(dialog).findByRole("article", { name: "Your ₦2,000 meal plan" });
    await user.click(within(dialog).getByRole("button", { name: "Listen to this reply" }));
    expect(spoken[0].text).toBe(
      "Your 2,000 naira meal plan. For 3 people, 1 day. Breakfast: Pap and egg, about 450 naira. Dinner: Beans and plantain. Estimated total 450 naira. About 1,550 naira left. Here is your plan. Want a cheaper dinner?",
    );
  });

  it("has no axe violations", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(planReply));
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Plan{Enter}");
    await within(dialog).findByRole("article", { name: "Your ₦2,000 meal plan" });
    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "document-title": { enabled: false },
        "html-has-lang": { enabled: false },
      },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("user settings", () => {
  it("saves the response language on this device and sends it with each message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ conversationId: "c1", message: "Ẹ ku àárọ̀", intent: "unknown" }),
    );
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Settings" }));
    const group = within(dialog).getByRole("group", { name: "Response language" });
    expect(within(group).getByRole("radio", { name: "Nigerian English" })).toBeChecked();

    await user.click(within(group).getByRole("radio", { name: /Yorùbá/ }));
    expect(within(dialog).getByText(/translated by AI and not yet checked/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({
      language: "yo-NG",
      voiceConfirm: false,
      signLanguage: false,
    });

    await user.click(within(dialog).getByRole("button", { name: "Back to chat" }));
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Hello{Enter}");
    await within(dialog).findByText("Ẹ ku àárọ̀");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      language: "yo-NG",
    });
  });

  it("restores the saved language, and ignores a corrupt saved value", async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: "en-US" }));
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Settings" }));
    expect(within(dialog).getByRole("radio", { name: "US English" })).toBeChecked();
    cleanup();

    window.localStorage.setItem(SETTINGS_KEY, "{not json");
    const second = await openChat();
    await second.user.click(within(second.dialog).getByRole("button", { name: "Settings" }));
    expect(within(second.dialog).getByRole("radio", { name: "Nigerian English" })).toBeChecked();
  });

  it("listens in the chosen language and hides Listen without a voice for it", async () => {
    installFakeSpeech(); // the fake device has no voices at all
    fetchMock.mockResolvedValue(
      jsonResponse({ conversationId: "c1", message: "Ẹ ku àárọ̀", intent: "unknown" }),
    );
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Settings" }));
    await user.click(within(dialog).getByRole("radio", { name: /Igbo/ }));
    expect(within(dialog).getByText(/no voice for this language/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Back to chat" }));

    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Hello{Enter}");
    await within(dialog).findByText("Ẹ ku àárọ̀");
    expect(within(dialog).queryByRole("button", { name: "Listen to this reply" })).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    const { FakeRecognition } = await import("../helpers/fake-speech");
    expect(FakeRecognition.last!.lang).toBe("ig-NG");
    act(() => FakeRecognition.last!.stop());
  });

  it("has no axe violations on the settings screen", async () => {
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Settings" }));
    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "document-title": { enabled: false },
        "html-has-lang": { enabled: false },
      },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("message box", () => {
  it("grows with its text up to its maximum height", async () => {
    const { user, dialog } = await openChat();
    const box = within(dialog).getByLabelText("Message Nutraboom Equals") as HTMLTextAreaElement;
    // jsdom has no layout, so give the box a content height and a CSS max-height.
    let contentHeight = 44;
    Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => contentHeight });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      maxHeight: "300px",
    } as CSSStyleDeclaration);

    contentHeight = 120;
    await user.type(box, "A longer question{Shift>}{Enter}{/Shift}on two lines");
    expect(box.style.height).toBe("122px");
    expect(box.style.overflowY).toBe("hidden");

    contentHeight = 900;
    await user.type(box, " and much more text");
    expect(box.style.height).toBe("300px");
    expect(box.style.overflowY).toBe("auto");
  });
});

describe("start modes and lunchboxes (ADR-058)", () => {
  it("starts 'What do I have?' and 'What can I afford?' conversations", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        conversationId: "c1",
        message: "What food do you have right now?",
        intent: "meal_planning",
      }),
    );
    const { user, dialog } = await openChat();
    const modes = within(dialog).getByRole("list", { name: "Start from" });
    await user.click(within(modes).getByRole("button", { name: /What do I have\?/ }));
    await within(dialog).findByText("What food do you have right now?");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).message).toBe(
      "What can I make with the food I already have at home?",
    );
  });

  it("marks food taken to school as Lunchbox", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Here is Monday.",
        intent: "meal_planning",
        metadata: {
          mealPlan: {
            days: [
              {
                day: "Monday",
                meals: [
                  {
                    mealType: "lunch",
                    name: "Jollof rice and egg",
                    foods: ["rice", "egg"],
                    packed: true,
                    why: "Rice gives energy and the egg adds protein.",
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Plan{Enter}");
    const card = await within(dialog).findByRole("region", { name: "Meal plan" });
    expect(within(card).getByText("Lunchbox")).toBeInTheDocument();
    expect(
      within(card).getByText("Rice gives energy and the egg adds protein."),
    ).toBeInTheDocument();
  });
});
