// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));

/**
 * Automated WCAG checks with axe-core (CLAUDE.md §31: accessibility basics).
 * Colour contrast needs real rendering, so it is checked in a browser instead.
 */
async function axeViolations(root: Element | Document = document) {
  const results = await axe.run(root as Element, {
    rules: {
      "color-contrast": { enabled: false },
      // Set by app/layout.tsx, which these tests do not render; checked in the browser.
      "document-title": { enabled: false },
      "html-has-lang": { enabled: false },
    },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
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

describe("accessibility", () => {
  it("home page has no axe violations", async () => {
    render(
      <GlobalAssistant>
        <HomePage />
      </GlobalAssistant>,
    );
    expect(await axeViolations()).toEqual([]);
  });

  it("open chat with every kind of reply card has no axe violations", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conversationId: "c1",
          message: "Here is a plan.",
          intent: "meal_planning",
          metadata: {
            urgentNotice: "Please seek care now.",
            safetyNotice: "Talk to your antenatal clinic.",
            allergyNotice: "Leaving out peanut.",
            mealPlan: {
              days: [
                {
                  day: "Day 1",
                  meals: [{ mealType: "lunch", name: "Rice and beans", foods: ["rice", "beans"] }],
                },
              ],
            },
            budget: {
              budget: 2000,
              region: "national",
              regionLabel: "national average",
              priceSource: "NBS Selected Food Price Watch, May 2026",
              priceSourceUrl: "https://microdata.nigerianstat.gov.ng/index.php/catalog/162",
              fromHome: ["beans"],
              purchases: [
                { name: "White garri", quantity: "0.5", unitLabel: "1 kg", estimatedCost: 410 },
              ],
              unpriced: [],
              estimatedTotal: 410,
              estimatedRemaining: 1590,
            },
            foods: [
              {
                id: "orange",
                name: "Orange",
                source: "FAO/INFOODS WAFCT 2019",
                sourceUrl: "https://www.fao.org/x.xlsx",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Plan{Enter}");
    await within(dialog).findByRole("region", { name: "Budget estimate" });

    expect(await axeViolations()).toEqual([]);
  });

  it("keeps the page usable while the chat is open on wider screens (ADR-083)", async () => {
    const { user, dialog } = await openChat();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.closest("[inert]")).toBeNull();
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(screen.getAllByRole("link", { name: "About us" })[0]).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("acts as a modal on phones: page inert, Tab kept inside", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("max-width"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const { user, dialog } = await openChat();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const heading = screen.getByRole("heading", { level: 1, hidden: true });
    expect(heading.closest("[inert]")).not.toBeNull();

    // The privacy link in the dialog header is the first control.
    const first = within(dialog).getByRole("link", { name: "Privacy" });
    const input = within(dialog).getByLabelText("Message Nutraboom Equals");
    // The send button is disabled while the input is empty, so the input is last.
    input.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(heading.closest("[inert]")).toBeNull();
  });
});
