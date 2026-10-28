"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatRole } from "@/lib/conversation/types";

type Chat = { id: string; title: string; updatedAt: string };
type HistoryList = { enabled: boolean; max: number; retentionDays: number; chats: Chat[] };

type Load =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error" }
  | { status: "ready"; data: HistoryList };

const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

/**
 * Saved chats (ADR-090), inside the chat panel. The server decides what is
 * saved and enforces the plan's limit; this view lists, opens and deletes.
 */
export function HistoryView({
  currentId,
  onOpen,
  onDeleted,
  onDone,
  fetchImpl = fetch,
}: {
  currentId?: string;
  onOpen: (id: string, messages: { role: ChatRole; content: string }[]) => void;
  /** Called after a chat is deleted, with its ID. */
  onDeleted: (id: string) => void;
  onDone: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchList = useCallback(async (): Promise<Load> => {
    try {
      const res = await fetchImpl("/api/conversations", { cache: "no-store" });
      if (res.status === 401) return { status: "signed-out" };
      if (!res.ok) return { status: "error" };
      return { status: "ready", data: (await res.json()) as HistoryList };
    } catch {
      return { status: "error" };
    }
  }, [fetchImpl]);

  const refresh = useCallback(async () => setLoad(await fetchList()), [fetchList]);

  useEffect(() => {
    let live = true;
    void fetchList().then((result) => {
      if (live) setLoad(result);
    });
    return () => {
      live = false;
    };
  }, [fetchList]);

  async function open(chat: Chat) {
    setBusy(chat.id);
    setNotice(null);
    try {
      const res = await fetchImpl(`/api/conversations/${chat.id}`, { cache: "no-store" });
      if (!res.ok) {
        setNotice(
          res.status === 403
            ? "Chat history isn't included in your plan, so saved chats can't be opened."
            : "That chat couldn't be opened. It may have been deleted.",
        );
        return void refresh();
      }
      const data = (await res.json()) as { messages: { role: ChatRole; content: string }[] };
      onOpen(chat.id, data.messages);
    } catch {
      setNotice("That chat couldn't be opened. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(chat: Chat) {
    if (!window.confirm(`Delete “${chat.title}”? This can't be undone.`)) return;
    setBusy(chat.id);
    setNotice(null);
    try {
      const res = await fetchImpl(`/api/conversations/${chat.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setNotice("That chat couldn't be deleted. Please try again.");
        return;
      }
      onDeleted(chat.id);
      setNotice("Chat deleted.");
      await refresh();
    } catch {
      setNotice("That chat couldn't be deleted. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="history-title" className="text-lg font-semibold text-ink">
          Saved chats
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-text hover:bg-subtle"
        >
          Back to chat
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-xl bg-subtle px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}

      {load.status === "loading" && <p className="text-sm text-muted">Loading your chats…</p>}

      {load.status === "error" && (
        <p className="text-sm text-ink">
          Your saved chats couldn&apos;t be loaded.{" "}
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-brand-text underline"
          >
            Try again
          </button>
        </p>
      )}

      {load.status === "signed-out" && (
        <p className="text-sm text-ink">
          <a href="/sign-in?next=/" className="font-medium text-brand-text underline">
            Sign in
          </a>{" "}
          to save your chats and come back to them later. Without an account, this chat is kept only
          in this browser tab.
        </p>
      )}

      {load.status === "ready" && (
        <>
          <p className="text-sm text-muted">
            {load.data.enabled ? (
              <>
                {load.data.chats.length} of {load.data.max} saved chats. A chat is deleted after{" "}
                {load.data.retentionDays} days without a new message.
              </>
            ) : (
              <>Chat history isn&apos;t included in your plan. You can still delete saved chats.</>
            )}
          </p>
          {load.data.enabled && load.data.chats.length >= load.data.max && (
            <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink">
              You&apos;ve reached your plan&apos;s limit, so new chats aren&apos;t saved. Delete a
              chat below, or{" "}
              <a href="/account/plan" className="font-medium text-brand-text underline">
                upgrade your plan
              </a>
              .
            </p>
          )}
          {load.data.chats.length === 0 ? (
            <p className="text-sm text-ink">
              No saved chats yet. Your chats are saved here as you go.
            </p>
          ) : (
            <ul className="space-y-2">
              {load.data.chats.map((chat) => (
                <li
                  key={chat.id}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {chat.title}
                      {chat.id === currentId && (
                        <span className="ml-2 text-xs font-normal text-muted">(open)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{when.format(new Date(chat.updatedAt))}</p>
                  </div>
                  {load.data.enabled && (
                    <button
                      type="button"
                      onClick={() => void open(chat)}
                      disabled={busy !== null}
                      aria-label={`Open “${chat.title}”`}
                      className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-text hover:bg-subtle disabled:opacity-50"
                    >
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(chat)}
                    disabled={busy !== null}
                    aria-label={`Delete “${chat.title}”`}
                    className="rounded-full px-3 py-1.5 text-sm font-medium text-danger hover:bg-subtle disabled:opacity-50"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
