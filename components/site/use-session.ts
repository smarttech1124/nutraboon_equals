"use client";

import { useEffect, useState } from "react";

export type SessionStatus = "unknown" | "signedIn" | "signedOut";

async function fetchStatus(): Promise<SessionStatus | null> {
  try {
    const res = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as { signedIn?: unknown };
    return body.signedIn === true ? "signedIn" : "signedOut";
  } catch {
    return null;
  }
}

/**
 * The visitor's sign-in state for the header (ADR-072). Dynamic pages know it
 * from the server and pass it in; static pages (home, about, 404) ask
 * /api/session after loading, and again when the tab regains focus or is
 * restored from the back/forward cache, so it never goes stale. While it is
 * unknown the header shows neither "Log in" nor "Your account". No answer is
 * cached between pages: after signing out, a stale "Your account" must not show.
 */
export function useSessionStatus(serverKnows?: boolean): SessionStatus {
  const initial: SessionStatus =
    serverKnows === undefined ? "unknown" : serverKnows ? "signedIn" : "signedOut";
  const [checked, setChecked] = useState<SessionStatus | undefined>(undefined);

  useEffect(() => {
    if (serverKnows !== undefined) return;
    let live = true;
    const check = () =>
      void fetchStatus().then((s) => {
        if (s && live) setChecked(s);
      });
    check();
    const onShow = () => document.visibilityState === "visible" && check();
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      live = false;
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, [serverKnows]);

  return serverKnows === undefined ? (checked ?? initial) : initial;
}
