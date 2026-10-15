"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChatPanel } from "./ChatPanel";

/** "minimized": a small bar keeps the conversation one click away (ADR-083). */
export type ChatMode = "closed" | "open" | "minimized";
export type ChatSize = "compact" | "expanded";

type ChatContextValue = {
  isOpen: boolean;
  mode: ChatMode;
  size: ChatSize;
  /** True when the open chat covers the whole screen (phones), so it acts as a modal. */
  fullScreen: boolean;
  open: (trigger?: HTMLElement | null) => void;
  close: () => void;
  minimize: () => void;
  toggleSize: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatPanel(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChatPanel must be used inside <ChatProvider>");
  return value;
}

/** Below Tailwind's sm breakpoint the chat fills the screen. */
const SMALL = "(max-width: 639.98px)";

function subscribeSmall(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(SMALL);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useSmallScreen(): boolean {
  return useSyncExternalStore(
    subscribeSmall,
    () => typeof window !== "undefined" && !!window.matchMedia?.(SMALL).matches,
    () => false,
  );
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ChatMode>("closed");
  const [size, setSize] = useState<ChatSize>("compact");
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const small = useSmallScreen();
  const isOpen = mode === "open";
  // On a phone the open chat covers the page, so the page is inert behind it.
  // On wider screens the chat is a side panel and the page stays usable
  // (links, scrolling, forms) while it is open.
  const fullScreen = isOpen && small;

  const open = useCallback((trigger?: HTMLElement | null) => {
    if (trigger) returnFocusTo.current = trigger;
    setMode("open");
  }, []);
  const close = useCallback(() => setMode("closed"), []);
  const minimize = useCallback(() => setMode("minimized"), []);
  const toggleSize = useCallback(
    () => setSize((s) => (s === "compact" ? "expanded" : "compact")),
    [],
  );

  // Return focus only after the re-render removes `inert` from the page:
  // browsers refuse to focus an element inside an inert region.
  useEffect(() => {
    if (mode === "closed" && returnFocusTo.current) {
      returnFocusTo.current.focus();
      returnFocusTo.current = null;
    }
  }, [mode]);

  const value = useMemo(
    () => ({ isOpen, mode, size, fullScreen, open, close, minimize, toggleSize }),
    [isOpen, mode, size, fullScreen, open, close, minimize, toggleSize],
  );

  return (
    <ChatContext.Provider value={value}>
      <div inert={fullScreen} className="contents">
        {children}
      </div>
      {/* Kept mounted while closed or minimized so the conversation survives. */}
      <ChatPanel />
    </ChatContext.Provider>
  );
}
