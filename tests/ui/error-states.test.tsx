// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { OFFLINE_ERROR, TIMEOUT_ERROR, useChat } from "@/components/chat/useChat";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A fetch that never answers, but stops when its request is aborted. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError")),
    );
  });

describe("useChat error states", () => {
  it("gives up on a hung request with a timeout message, and retry works", async () => {
    const fetchImpl = vi.fn<typeof fetch>(hangingFetch);
    const { result } = renderHook(() => useChat(fetchImpl, 50));

    act(() => result.current.sendMessage("hello"));
    await waitFor(() => expect(result.current.error).toBe(TIMEOUT_ERROR));
    expect(result.current.isLoading).toBe(false);
    // The user's message stays visible so they can retry it.
    expect(result.current.messages.map((m) => m.content)).toEqual(["hello"]);

    fetchImpl.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversationId: "c1", message: "Hi!", intent: "unknown" }), {
        status: 200,
      }),
    );
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.messages.at(-1)?.content).toBe("Hi!"));
    expect(result.current.error).toBeUndefined();
  });

  it("says when the device is offline instead of sending", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchImpl = vi.fn<typeof fetch>();
    const { result } = renderHook(() => useChat(fetchImpl));

    act(() => result.current.sendMessage("hello"));
    await waitFor(() => expect(result.current.error).toBe(OFFLINE_ERROR));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shows the server's friendly message for rate limits", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "rate_limited", message: "You're sending messages a little fast." },
        }),
        { status: 429 },
      ),
    );
    const { result } = renderHook(() => useChat(fetchImpl));
    act(() => result.current.sendMessage("hello"));
    await waitFor(() =>
      expect(result.current.error).toBe("You're sending messages a little fast."),
    );
  });

  it("falls back to the generic message for a non-JSON error page (e.g. a 504)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 504 }));
    const { result } = renderHook(() => useChat(fetchImpl));
    act(() => result.current.sendMessage("hello"));
    await waitFor(() => expect(result.current.error).toMatch(/trouble connecting/));
  });
});

describe("error and not-found pages", () => {
  it("shows a friendly error without details and retries", async () => {
    const retry = vi.fn();
    render(<ErrorPage error={new Error("db password=secret")} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("links back home from the not-found page", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });
});
