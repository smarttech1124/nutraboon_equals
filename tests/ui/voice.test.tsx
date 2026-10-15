// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));
import { FakeRecognition, installFakeSpeech, uninstallFakeSpeech } from "../helpers/fake-speech";

const fetchMock = vi.fn<typeof fetch>();

function reply(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  uninstallFakeSpeech();
  vi.unstubAllGlobals();
});

describe("voice input and read-aloud", () => {
  it("hides the microphone where the browser has no speech recognition", async () => {
    const { dialog } = await openChat();
    expect(within(dialog).queryByRole("button", { name: "Speak your message" })).toBeNull();
  });

  it("puts the transcript in the box for review instead of sending it", async () => {
    installFakeSpeech();
    const { user, dialog } = await openChat();

    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    expect(within(dialog).getByRole("button", { name: "Stop voice input" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent("Listening…");

    act(() => {
      FakeRecognition.last!.say("what can I cook with garri", false);
    });
    expect(within(dialog).getByRole("status")).toHaveTextContent("what can I cook with garri");

    act(() => {
      FakeRecognition.last!.say("what can I cook with garri");
    });
    await user.click(within(dialog).getByRole("button", { name: "Stop voice input" }));

    expect(within(dialog).getByLabelText("Message Nutraboom Equals")).toHaveValue(
      "what can I cook with garri",
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Ready. You said: “what can I cook with garri”. Check the text, then press Send.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows when the last words are still being processed, and waits to send", async () => {
    installFakeSpeech();
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    const rec = FakeRecognition.last!;
    rec.stop = vi.fn(); // the browser reports the end a moment later
    act(() => rec.say("a long question about feeding my family", false));
    await user.click(within(dialog).getByRole("button", { name: "Stop voice input" }));

    expect(within(dialog).getByRole("status")).toHaveTextContent("Processing your last words…");
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();

    act(() => {
      rec.say("a long question about feeding my family of five", true);
      rec.end();
    });
    expect(within(dialog).getByLabelText("Message Nutraboom Equals")).toHaveValue(
      "a long question about feeding my family of five",
    );
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("reads the reply to a spoken question aloud, urgent notice first, and can stop", async () => {
    const { synth, spoken } = installFakeSpeech();
    fetchMock.mockResolvedValueOnce(
      reply({
        conversationId: "c1",
        message: "Please get help now.",
        intent: "safety_sensitive",
        metadata: { urgentNotice: "Go to the nearest hospital now, or call 112." },
      }),
    );
    const { user, dialog } = await openChat();

    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    act(() => FakeRecognition.last!.say("my son cannot breathe"));
    await user.click(within(dialog).getByRole("button", { name: "Stop voice input" }));
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(synth.speak).toHaveBeenCalled());
    expect(spoken[0].text).toBe(
      "Go to the nearest hospital now, or call 112. Please get help now.",
    );

    await user.click(within(dialog).getByRole("button", { name: /^stop reading$/i }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", { name: /^stop reading$/i })).toBeNull();
  });

  it("does not read aloud replies to typed messages", async () => {
    const { synth } = installFakeSpeech();
    fetchMock.mockResolvedValueOnce(
      reply({ conversationId: "c1", message: "Here are ideas.", intent: "general_nutrition" }),
    );
    const { user, dialog } = await openChat();

    await user.type(within(dialog).getByLabelText("Message Nutraboom Equals"), "Ideas?{Enter}");
    await within(dialog).findByText("Here are ideas.");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("explains a blocked microphone", async () => {
    installFakeSpeech();
    const { user, dialog } = await openChat();

    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    act(() => {
      FakeRecognition.last!.fail("not-allowed");
      FakeRecognition.last!.end();
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/Microphone access is blocked/);
  });

  it("stops listening and talking when the chat closes", async () => {
    const { synth } = installFakeSpeech();
    const { user, dialog } = await openChat();

    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
    const recognition = FakeRecognition.last!;
    await user.keyboard("{Escape}");

    expect(recognition.stop).toHaveBeenCalled();
    expect(synth.cancel).toHaveBeenCalled();
  });
});

describe("voice controls accessibility", () => {
  it("has no axe violations while listening", async () => {
    const axe = (await import("axe-core")).default;
    installFakeSpeech();
    const { user, dialog } = await openChat();
    await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));

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
