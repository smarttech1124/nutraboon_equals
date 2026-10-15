// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));
import { installFakeSpeech, uninstallFakeSpeech } from "../helpers/fake-speech";

const fetchMock = vi.fn<typeof fetch>();

const reply = (body: object) =>
  new Response(JSON.stringify({ conversationId: "c1", intent: "general_nutrition", ...body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

async function chatWithReplies(...replies: object[]) {
  for (const r of replies) fetchMock.mockResolvedValueOnce(reply(r));
  const user = userEvent.setup();
  render(
    <GlobalAssistant>
      <HomePage />
    </GlobalAssistant>,
  );
  await user.click(screen.getByRole("button", { name: /ask nutraboom equals/i, expanded: false }));
  const dialog = screen.getByRole("dialog", { name: "Nutraboom Equals" });
  for (let i = 0; i < replies.length; i++) {
    await user.type(
      within(dialog).getByLabelText("Message Nutraboom Equals"),
      `Question ${i}{Enter}`,
    );
    await within(dialog);
    await within(dialog).findByText((replies[i] as { message: string }).message);
  }
  return { user, dialog };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  uninstallFakeSpeech();
  vi.unstubAllGlobals();
});

describe("Listen button", () => {
  it("is not shown where the browser cannot speak", async () => {
    const { dialog } = await chatWithReplies({ message: "Here are ideas." });
    expect(within(dialog).queryByRole("button", { name: "Listen to this reply" })).toBeNull();
  });

  it("appears on replies only and reads the reply, urgent notice first, without auto-playing", async () => {
    const { synth, spoken } = installFakeSpeech();
    const { user, dialog } = await chatWithReplies({
      message: "Please get help now.",
      intent: "safety_sensitive",
      metadata: { urgentNotice: "Go to the nearest hospital now, or call 112." },
    });

    // Typed question: nothing plays until the user taps Listen.
    expect(synth.speak).not.toHaveBeenCalled();
    const listen = within(dialog).getAllByRole("button", { name: "Listen to this reply" });
    expect(listen).toHaveLength(1); // the user's own message has no button

    await user.click(listen[0]);
    expect(spoken[0].text).toBe(
      "Go to the nearest hospital now, or call 112. Please get help now.",
    );
    const stop = within(dialog).getByRole("button", { name: "Stop reading this reply" });
    expect(stop).toHaveAttribute("aria-pressed", "true");

    await user.click(stop);
    expect(synth.cancel).toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Listen to this reply" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches to another reply, and a cancelled reading cannot reset the new one", async () => {
    const { spoken } = installFakeSpeech();
    const { user, dialog } = await chatWithReplies(
      { message: "First reply." },
      { message: "Second reply." },
    );

    const [first, second] = within(dialog).getAllByRole("button", { name: "Listen to this reply" });
    await user.click(first);
    await user.click(second);
    expect(spoken.map((u) => u.text)).toEqual(["First reply.", "Second reply."]);

    // The browser reports the first reading as ended after it was cancelled.
    act(() => spoken[0].onend?.());
    const buttons = within(dialog).getAllByRole("button", { name: /this reply/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Listen to this reply",
      "Stop reading this reply",
    ]);
  });

  it("returns to Listen when the reading finishes", async () => {
    const { spoken } = installFakeSpeech();
    const { user, dialog } = await chatWithReplies({ message: "All done." });

    await user.click(within(dialog).getByRole("button", { name: "Listen to this reply" }));
    act(() => spoken[0].onend?.());
    expect(
      within(dialog).getByRole("button", { name: "Listen to this reply" }),
    ).toBeInTheDocument();
  });

  it("has no axe violations with Listen buttons", async () => {
    installFakeSpeech();
    await chatWithReplies({ message: "Reply one." });
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
