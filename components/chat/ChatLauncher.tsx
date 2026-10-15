"use client";

import { useChatPanel } from "./ChatProvider";

type Props = {
  variant?: "hero" | "floating";
};

export function ChatLauncher({ variant = "hero" }: Props) {
  const { isOpen, mode, open } = useChatPanel();

  if (variant === "floating") {
    // While open or minimized, the chat itself (or its bar) takes this place.
    if (mode !== "closed") return null;
    return (
      // Global entry point (ADR-072): bottom right on every main-site page, above
      // the safe area on phones. Icon only on small screens, labelled on wider ones.
      <button
        type="button"
        onClick={(e) => open(e.currentTarget)}
        aria-label="Ask Nutraboom Equals"
        aria-haspopup="dialog"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center gap-2 rounded-full bg-brand text-white shadow-lg ring-2 ring-white/70 transition hover:bg-brand-strong sm:right-6 sm:bottom-6 md:size-auto md:min-h-14 md:px-5 print:hidden dark:ring-black/30"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
        <span aria-hidden="true" className="hidden font-semibold md:inline">
          Ask Nutraboom Equals
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => open(e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      className="inline-flex items-center gap-3 rounded-full bg-brand px-7 py-4 text-lg font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-strong"
    >
      Ask Nutraboom Equals <span aria-hidden="true">💬</span>
    </button>
  );
}
