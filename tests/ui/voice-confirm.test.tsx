// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { GlobalAssistant } from "@/components/chat/GlobalAssistant";

// The header's session check would use the mocked fetch meant for the chat API.
vi.mock("@/components/site/use-session", () => ({ useSessionStatus: () => "signedOut" }));
import { SETTINGS_KEY } from "@/components/chat/useSettings";
import { parseVoiceCommand } from "@/lib/voice/commands";
import { FakeRecognition, installFakeSpeech, uninstallFakeSpeech } from "../helpers/fake-speech";

const fetchMock = vi.fn<typeof fetch>();
const reply = (message: string) =>
  new Response(JSON.stringify({ conversationId: "c1", message, intent: "unknown" }), {
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  uninstallFakeSpeech();
  vi.unstubAllGlobals();
});

/** Opens the chat and records one voice message, ending with the user's tap on ■. */
async function recordVoiceMessage(text: string) {
  const speech = installFakeSpeech();
  const user = userEvent.setup();
  render(
    <GlobalAssistant>
      <HomePage />
    </GlobalAssistant>,
  );
  await user.click(screen.getByRole("button", { name: /ask nutraboom equals/i, expanded: false }));
  const dialog = screen.getByRole("dialog", { name: "Nutraboom Equals" });
  await user.click(within(dialog).getByRole("button", { name: "Speak your message" }));
  act(() => FakeRecognition.last!.say(text));
  await user.click(within(dialog).getByRole("button", { name: "Stop voice input" }));
  return { ...speech, user, dialog };
}

const turnOnConfirmation = () =>
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ language: "en-NG", voiceConfirm: true }),
  );

describe("parseVoiceCommand", () => {
  it.each([
    ["send", "send"],
    ["Send it.", "send"],
    ["yes", "send"],
    ["again", "again"],
    ["try again please", "again"],
    ["no", "again"],
    ["cancel", "cancel"],
    ["don't send", "cancel"],
  ] as const)("%j means %s", (said, command) => {
    expect(parseVoiceCommand(said)).toBe(command);
  });

  it("ignores anything longer or unclear", () => {
    expect(parseVoiceCommand("please send me a meal plan for my family")).toBeUndefined();
    expect(parseVoiceCommand("rice and beans")).toBeUndefined();
    expect(parseVoiceCommand("")).toBeUndefined();
  });
});

describe("spoken confirmation of a voice message (ADR-057)", () => {
  it("reads the message back and sends it when the user says send", async () => {
    turnOnConfirmation();
    fetchMock.mockResolvedValueOnce(reply("At 8 months she can have soft mashed foods."));
    const { spoken, dialog } = await recordVoiceMessage("my baby is 8 months what can she eat");

    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].text).toBe(
      "I heard: my baby is 8 months what can she eat. Say send to send it, or again to record it again.",
    );
    // Nothing is sent until the user confirms.
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => spoken[0].onend?.());
    expect(within(dialog).getByRole("status")).toHaveTextContent("Say “send” to send it");
    act(() => {
      FakeRecognition.last!.say("send");
      FakeRecognition.last!.end();
    });

    await within(dialog).findByText("At 8 months she can have soft mashed foods.");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      message: "my baby is 8 months what can she eat",
      inputMode: "voice",
    });
  });

  it("records again when the user says again", async () => {
    turnOnConfirmation();
    const { spoken, dialog } = await recordVoiceMessage("my baby is 18 months");
    await waitFor(() => expect(spoken).toHaveLength(1));
    await act(async () => spoken[0].onend?.());
    act(() => {
      FakeRecognition.last!.say("again");
      FakeRecognition.last!.end();
    });

    expect(within(dialog).getByLabelText("Message Nutraboom Equals")).toHaveValue("");
    expect(within(dialog).getByRole("status")).toHaveTextContent("Listening…");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the message unsent after silence or an unclear reply", async () => {
    turnOnConfirmation();
    const { spoken, dialog } = await recordVoiceMessage("plan dinner");
    await waitFor(() => expect(spoken).toHaveLength(1));
    await act(async () => spoken[0].onend?.());
    act(() => FakeRecognition.last!.end()); // nothing said

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Not sent. You said: “plan dinner”. Check the text, then press Send.",
    );
    expect(within(dialog).getByLabelText("Message Nutraboom Equals")).toHaveValue("plan dinner");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is off by default: the message waits for Send, with the transcript announced", async () => {
    const { spoken, dialog } = await recordVoiceMessage("plan dinner");
    expect(spoken).toHaveLength(0);
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Ready. You said: “plan dinner”. Check the text, then press Send.",
    );
  });

  it("can be switched on in Settings", async () => {
    installFakeSpeech();
    const user = userEvent.setup();
    render(
      <GlobalAssistant>
        <HomePage />
      </GlobalAssistant>,
    );
    await user.click(
      screen.getByRole("button", { name: /ask nutraboom equals/i, expanded: false }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nutraboom Equals" });
    await user.click(within(dialog).getByRole("button", { name: "Settings" }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Read my voice message back/ }));
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({
      voiceConfirm: true,
    });
  });
});
