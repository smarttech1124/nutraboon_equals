// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessConversationView,
  type ConversationMessage,
} from "@/components/hospitals/conversation";

/** The accessibility conversation used by patients and hospital staff (ADR-068). */

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const MESSAGES: ConversationMessage[] = [
  {
    id: "m1",
    sender: "patient",
    text: "Where is the antenatal clinic?",
    inputMode: "voice",
    createdAt: "2026-10-09T08:00:00.000Z",
  },
  {
    id: "m2",
    sender: "agent",
    text: "Thank you. A staff member will reply here.",
    inputMode: "text",
    createdAt: "2026-10-09T08:00:01.000Z",
  },
];

function poll(messages: ConversationMessage[], status = "open") {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ status, assigned: false, messages }), { status: 200 }),
  );
}

describe("AccessConversationView", () => {
  it("labels who said what, including spoken messages", () => {
    render(
      <AccessConversationView
        conversationId="c1"
        initialMessages={MESSAGES}
        initialStatus="open"
        viewer="patient"
        sendAction={async () => ({ status: "success", message: "" })}
      />,
    );
    const list = screen.getByRole("list", { name: "Conversation" });
    expect(list).toHaveTextContent("You · spoken");
    expect(list).toHaveTextContent("Nutraboom Equals assistant");
  });

  it("sends a message, clears the box and fetches only newer messages", async () => {
    const sendAction = vi.fn(async () => ({ status: "success" as const, message: "Sent" }));
    poll([
      {
        id: "m3",
        sender: "staff",
        text: "It is on the first floor.",
        inputMode: "text",
        createdAt: "2026-10-09T08:05:00.000Z",
      },
    ]);
    const user = userEvent.setup();
    render(
      <AccessConversationView
        conversationId="c1"
        initialMessages={MESSAGES}
        initialStatus="open"
        viewer="patient"
        sendAction={sendAction}
      />,
    );
    const box = screen.getByLabelText("Your message");
    await user.type(box, "Thank you");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendAction).toHaveBeenCalled());
    const form = (sendAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(form.get("text")).toBe("Thank you");
    expect(form.get("inputMode")).toBe("text");
    await waitFor(() => expect(box).toHaveValue(""));
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/access-conversations/c1?after=${encodeURIComponent("2026-10-09T08:00:01.000Z")}`,
    );
    expect(await screen.findByText("It is on the first floor.")).toBeInTheDocument();
  });

  it("shows a send error and keeps the draft", async () => {
    const user = userEvent.setup();
    render(
      <AccessConversationView
        conversationId="c1"
        initialMessages={MESSAGES}
        initialStatus="open"
        viewer="staff"
        sendAction={async () => ({ status: "error", message: "This conversation is closed." })}
      />,
    );
    const box = screen.getByLabelText("Your reply to the patient");
    await user.type(box, "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("This conversation is closed.")).toBeInTheDocument();
    expect(box).toHaveValue("Hello");
    // Staff do not get the patient's speech controls.
    expect(screen.queryByRole("button", { name: "Speak instead" })).not.toBeInTheDocument();
  });

  it("switches to the closed notice when a poll says it closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    poll([], "closed");
    render(
      <AccessConversationView
        conversationId="c1"
        initialMessages={MESSAGES}
        initialStatus="open"
        viewer="patient"
        sendAction={async () => ({ status: "success", message: "" })}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(await screen.findByText(/This conversation is closed/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your message")).not.toBeInTheDocument();
  });

  it("has no automatic accessibility violations", async () => {
    const { container } = render(
      <AccessConversationView
        conversationId="c1"
        initialMessages={MESSAGES}
        initialStatus="open"
        viewer="patient"
        sendAction={async () => ({ status: "success", message: "" })}
      />,
    );
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
