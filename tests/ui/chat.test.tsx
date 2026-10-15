// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

describe("home page and chat", () => {
  it("renders the value proposition and a launcher", () => {
    render(
      <GlobalAssistant>
        <HomePage />
      </GlobalAssistant>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /learn, plan, and get help in your language/i,
    );
    expect(screen.getAllByRole("button", { name: /ask nutraboom equals/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the chat with suggested prompts and focuses the input", async () => {
    const { dialog } = await openChat();
    expect(within(dialog).getByRole("button", { name: /₦2,000/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Message Nutraboom Equals")).toHaveFocus();
  });

  it("submits with Enter and shows the assistant reply", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Oranges are a good source of vitamin C.",
        intent: "food_information",
      }),
    );
    const { user, dialog } = await openChat();

    await user.type(
      within(dialog).getByLabelText("Message Nutraboom Equals"),
      "Tell me about oranges{Enter}",
    );

    const log = within(dialog).getByRole("log");
    expect(log).toHaveTextContent("Tell me about oranges");
    expect(await within(log).findByText(/good source of vitamin c/i)).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      message: "Tell me about oranges",
      language: "en-NG",
    });
  });

  it("sends a suggested prompt and reuses the conversation id", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ conversationId: "c1", message: "Who for?", intent: "meal_planning" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ conversationId: "c1", message: "Great.", intent: "meal_planning" }),
      );
    const { user, dialog } = await openChat();

    await user.click(within(dialog).getByRole("button", { name: /plan meals for my family/i }));
    await within(dialog).findByText("Who for?");
    await user.type(
      within(dialog).getByLabelText("Message Nutraboom Equals"),
      "Four people{Enter}",
    );
    await within(dialog).findByText("Great.");

    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({
      conversationId: "c1",
      message: "Four people",
      language: "en-NG",
    });
  });

  it("links the data sources behind a nutrition answer", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "A medium orange has about 58 kcal.",
        intent: "food_information",
        metadata: {
          foods: [
            {
              id: "orange",
              name: "Orange",
              source: "FAO/INFOODS Food Composition Table for Western Africa (2019)",
              sourceUrl: "https://www.fao.org/wafct.xlsx",
              servingSource: "USDA FoodData Central, SR Legacy",
              servingSourceUrl: "https://fdc.nal.usda.gov/food-details/169097/nutrients",
            },
          ],
        },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Orange?{Enter}");

    const fao = await within(dialog).findByRole("link", { name: /FAO\/INFOODS/ });
    expect(fao).toHaveAttribute("href", "https://www.fao.org/wafct.xlsx");
    expect(fao).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(dialog).getByRole("link", { name: /USDA/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/values are approximate/i)).toBeInTheDocument();
  });

  it("renders a meal plan card with the needs-vary note", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Here is a plan for today.",
        intent: "meal_planning",
        metadata: {
          mealPlan: {
            days: [
              {
                day: "Day 1",
                meals: [
                  {
                    mealType: "breakfast",
                    name: "Pap and akara",
                    foods: ["pap", "beans", "onion"],
                  },
                  {
                    mealType: "dinner",
                    name: "Yam and egg sauce",
                    foods: ["yam", "egg", "tomato"],
                    portionNote: "Smaller portion for the 3-year-old.",
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
    expect(within(card).getByRole("heading", { name: "Day 1" })).toBeInTheDocument();
    expect(within(card).getByText("Pap and akara")).toBeInTheDocument();
    expect(within(card).getByText("yam, egg, tomato")).toBeInTheDocument();
    expect(within(card).getByText("Smaller portion for the 3-year-old.")).toBeInTheDocument();
    expect(within(card).getByText(/nutritional needs vary/i)).toBeInTheDocument();
  });

  it("renders a budget card with estimates, unpriced items and the source", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Make garri and beans.",
        intent: "budget_planning",
        metadata: {
          budget: {
            budget: 2000,
            region: "south_west",
            regionLabel: "South West average",
            priceSource: "NBS Selected Food Price Watch, May 2026",
            priceSourceUrl: "https://microdata.nigerianstat.gov.ng/index.php/catalog/162",
            fromHome: ["beans", "palm oil"],
            purchases: [
              { name: "White garri", quantity: "0.5", unitLabel: "1 kg", estimatedCost: 410 },
            ],
            unpriced: ["rice"],
            estimatedTotal: 410,
            estimatedRemaining: 1590,
          },
        },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Budget{Enter}");

    const card = await within(dialog).findByRole("region", { name: "Budget estimate" });
    expect(within(card).getByText("Budget: ₦2,000")).toBeInTheDocument();
    expect(within(card).getByText("beans, palm oil")).toBeInTheDocument();
    expect(within(card).getByText("about ₦410")).toBeInTheDocument();
    expect(within(card).getByText("Estimated remaining")).toBeInTheDocument();
    expect(within(card).getByText("₦1,590")).toBeInTheDocument();
    expect(within(card).getByText(/No price estimate yet for: rice/)).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: /NBS Selected Food Price Watch/ }),
    ).toHaveAttribute("href", "https://microdata.nigerianstat.gov.ng/index.php/catalog/162");
    expect(within(card).getByText(/Not current market prices/)).toBeInTheDocument();
  });

  it("shows an urgent-care notice as an alert before the reply", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Please get help now.",
        intent: "safety_sensitive",
        metadata: { urgentNotice: "This sounds like it may need urgent medical care. Call 112." },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Help{Enter}");

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("urgent medical care. Call 112.");
  });

  it("shows the allergy notice", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Make rice and beans with palm oil.",
        intent: "meal_planning",
        metadata: { allergyNotice: "Heads-up: groundnut oil contains peanut." },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Dinner?{Enter}");
    expect(
      await within(dialog).findByText("Heads-up: groundnut oil contains peanut."),
    ).toBeVisible();
    expect(within(dialog).getByText("Allergy note:")).toBeInTheDocument();
  });

  it("shows the safety notice when one is returned", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        conversationId: "c1",
        message: "Here are some general ideas.",
        intent: "safety_sensitive",
        metadata: { safetyNotice: "Check with your child's doctor." },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(
      within(dialog).getByLabelText("Message Nutraboom Equals"),
      "Meals for my 3-year-old{Enter}",
    );
    expect(await within(dialog).findByText("Check with your child's doctor.")).toBeInTheDocument();
  });

  it("shows an error and retries the same message", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "ai_unavailable",
              message: "I'm having trouble connecting right now. Please try again in a moment.",
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ conversationId: "c1", message: "Back now!", intent: "unknown" }),
      );
    const { user, dialog } = await openChat();

    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "hello{Enter}");
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(/trouble connecting/i);

    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("Back now!")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    // The user's message is shown once, not duplicated by the retry.
    expect(within(dialog).getAllByText("hello")).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).message).toBe("hello");
  });

  it("shows a friendly error when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "hello{Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/trouble connecting/i);
  });

  it("closes with Escape and returns focus to the launcher", async () => {
    const { user } = await openChat();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /ask nutraboom equals/i, expanded: false }),
    ).toHaveFocus();
  });

  it("does not send empty messages", async () => {
    const { dialog } = await openChat();
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("chat controls (ADR-083)", () => {
  const reply = (message: string, id = "c1") =>
    jsonResponse({ conversationId: id, message, intent: "food_information" });

  it("minimizes to a bar that keeps the conversation, and restores it", async () => {
    fetchMock.mockResolvedValueOnce(reply("Oranges have vitamin C."));
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Oranges?{Enter}");
    await within(dialog).findByText("Oranges have vitamin C.");

    await user.click(within(dialog).getByRole("button", { name: "Minimize chat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Minimized chat" });
    const restore = within(bar).getByRole("button", { name: "Open the chat" });
    expect(restore).toHaveFocus();
    // The floating launcher gives way to the bar; only the home page's own button remains.
    expect(screen.getAllByRole("button", { name: "Ask Nutraboom Equals" })).toHaveLength(1);

    await user.click(restore);
    expect(screen.getByRole("dialog")).toHaveTextContent("Oranges have vitamin C.");
  });

  it("expands and shrinks the panel", async () => {
    const { user, dialog } = await openChat();
    const expand = within(dialog).getByRole("button", { name: "Expand the chat" });
    expect(expand).toHaveAttribute("aria-pressed", "false");
    await user.click(expand);
    expect(within(dialog).getByRole("button", { name: "Make the chat smaller" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("starts a new chat after confirming, with a new conversation on the server", async () => {
    fetchMock
      .mockResolvedValueOnce(reply("First answer.", "c1"))
      .mockResolvedValueOnce(reply("Fresh answer.", "c2"));
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { user, dialog } = await openChat();
    const input = within(dialog).getByLabelText("Message Nutraboom Equals");
    await user.type(input, "Hello{Enter}");
    await within(dialog).findByText("First answer.");

    await user.click(within(dialog).getByRole("button", { name: "New chat" }));
    expect(within(dialog).getByText("First answer.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "New chat" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByText("First answer.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("list", { name: "Suggested questions" })).toBeInTheDocument();

    await user.type(input, "Again{Enter}");
    await within(dialog).findByText("Fresh answer.");
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
    expect(body.conversationId).toBeUndefined();
  });
});
