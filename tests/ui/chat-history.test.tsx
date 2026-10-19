// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";
import { SESSION_KEY } from "@/components/chat/useChat";

vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedIn" }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
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

const list = {
  enabled: true,
  max: 3,
  retentionDays: 30,
  chats: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Rice for four",
      updatedAt: "2026-10-18T10:00:00Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Oranges",
      updatedAt: "2026-10-17T10:00:00Z",
    },
  ],
};

describe("saved chats (ADR-090)", () => {
  it("lists saved chats, reopens one and continues the same conversation", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/conversations") return json(list);
      if (url.startsWith("/api/conversations/1111")) {
        return json({
          id: list.chats[0]!.id,
          messages: [
            { role: "user", content: "Rice for four people" },
            { role: "assistant", content: "Jollof rice works well." },
          ],
        });
      }
      if (url === "/api/chat") {
        const body = JSON.parse(String(init!.body));
        expect(body.conversationId).toBe(list.chats[0]!.id);
        return json({
          conversationId: body.conversationId,
          message: "Add beans.",
          intent: "meal_planning",
          history: { saved: true },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Saved chats" }));
    expect(
      await within(dialog).findByText("2 of 3 saved chats.", { exact: false }),
    ).toBeInTheDocument();
    const audit = await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Open “Rice for four”" }));
    expect(await within(dialog).findByText("Jollof rice works well.")).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText("Message Nutraboom Equals"),
      "And protein?{Enter}",
    );
    expect(await within(dialog).findByText("Add beans.")).toBeInTheDocument();
    // The open chat is kept in this tab, for a reload.
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).conversationId).toBe(list.chats[0]!.id);
  });

  it("deletes a chat and shows the limit with a way to upgrade", async () => {
    let chats = [
      ...list.chats,
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Yam",
        updatedAt: "2026-10-16T10:00:00Z",
      },
    ];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/conversations") return json({ ...list, chats });
      if (init?.method === "DELETE") {
        chats = chats.filter((c) => !url.endsWith(c.id));
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${url}`);
    });
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Saved chats" }));
    expect(await within(dialog).findByText(/reached your plan's limit/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "upgrade your plan" })).toHaveAttribute(
      "href",
      "/account/plan",
    );
    await user.click(within(dialog).getByRole("button", { name: "Delete “Yam”" }));
    await waitFor(() => expect(within(dialog).queryByText("Yam")).not.toBeInTheDocument());
    expect(within(dialog).queryByText(/reached your plan's limit/)).not.toBeInTheDocument();
  });

  it("tells a signed-out visitor to sign in to save chats", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Saved chats" }));
    expect(await within(dialog).findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("says when a chat is not being saved because the limit is reached", async () => {
    fetchMock.mockResolvedValue(
      json({
        conversationId: "c1",
        message: "Hello!",
        intent: "unknown",
        history: { saved: false, reason: "limit", max: 3 },
      }),
    );
    const { user, dialog } = await openChat();
    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Hi{Enter}");
    expect(
      await within(dialog).findByText(/isn't being saved: you have 3 saved chats/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Manage saved chats" }));
    expect(within(dialog).getByRole("heading", { name: "Saved chats" })).toBeInTheDocument();
  });
});
