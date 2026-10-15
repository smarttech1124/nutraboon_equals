// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SignLanguageResponse,
  SignLanguageResponseSlot,
} from "@/components/sign/SignLanguageResponse";
import { SignResponseToggle } from "@/components/sign/SignResponseToggle";
import { DEMO_SIGN_VIDEOS } from "@/lib/sign/demo-videos";
import { DEMO_NOTICE } from "@/lib/sign/types";

/** The shared sign-language response player (ADR-077). */

const fetchMock = vi.fn<typeof fetch>();
const [first, second] = DEMO_SIGN_VIDEOS;

function ok(video = first!) {
  return new Response(
    JSON.stringify({ status: "ok", response: { kind: "demo", video, notice: DEMO_NOTICE } }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function body(call: number) {
  return JSON.parse(String((fetchMock.mock.calls[call]![1] as RequestInit).body));
}

describe("SignLanguageResponse", () => {
  it("asks for a response, shows the demo notice and a labelled, muted video with controls", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    render(<SignLanguageResponse text="An orange has vitamin C." module="assistant" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Preparing a sign language video/);
    const video = (await screen.findByLabelText(
      /Sign language demonstration video/,
    )) as HTMLVideoElement;
    expect(body(0)).toMatchObject({ module: "assistant", text: "An orange has vitamin C." });
    expect(screen.getByText(DEMO_NOTICE)).toBeInTheDocument();
    expect(video).toHaveAttribute("controls");
    expect(video.muted).toBe(true);
    expect(video).toHaveAccessibleDescription(DEMO_NOTICE);
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole("status")).toHaveTextContent(/ready/);
    expect(screen.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wikimedia Commons/ })).toHaveAttribute(
      "href",
      first!.attribution.sourceUrl,
    );
  });

  it("tries another video when one fails, reports it, and remembers it for the visit", async () => {
    fetchMock.mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const { container } = render(<SignLanguageResponse text="x" module="planner" />);
    await screen.findByLabelText(/Sign language demonstration video/);
    const sources = container.querySelectorAll("source");
    fireEvent.error(sources[sources.length - 1]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(body(1).failed).toEqual([first!.id]);
    expect(body(1).exclude).toContain(first!.id);
    expect(JSON.parse(window.sessionStorage.getItem("nbe:sign-failed")!)).toEqual([first!.id]);
    await waitFor(() =>
      expect(screen.getByLabelText(new RegExp(second!.title.slice(0, 10)))).toBeInTheDocument(),
    );
  });

  it("stops and keeps calm when no video can play", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "none" })));
    render(<SignLanguageResponse text="x" module="hospital" />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /No sign language video can be played right now/,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers another demo video on request", async () => {
    fetchMock.mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(second));
    const user = userEvent.setup();
    render(<SignLanguageResponse text="x" module="assistant" />);
    fireEvent.loadedMetadata(await screen.findByLabelText(/Sign language demonstration video/));
    await user.click(screen.getByRole("button", { name: "Show another demo video" }));
    expect(body(1).exclude).toContain(first!.id);
  });

  it("has no automatic accessibility violations", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { container } = render(<SignLanguageResponse text="x" module="assistant" />);
    fireEvent.loadedMetadata(await screen.findByLabelText(/Sign language demonstration video/));
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("older replies and the shared setting", () => {
  it("loads a video for an older reply only when asked", async () => {
    fetchMock.mockResolvedValue(ok());
    const user = userEvent.setup();
    render(<SignLanguageResponseSlot text="x" module="assistant" latest={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show sign language video (demo)" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("saves the choice for every module on this device", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SignResponseToggle id="a" />
        <SignResponseToggle id="b" />
      </>,
    );
    const [a, b] = screen.getAllByRole("checkbox", { name: /Sign language response/ });
    await user.click(a!);
    expect(b).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem("nbe:settings")!).signLanguage).toBe(true);
    await act(async () => {});
  });
});
