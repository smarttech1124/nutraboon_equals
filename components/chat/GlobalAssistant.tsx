"use client";

import type { ReactNode } from "react";
import { ChatLauncher } from "./ChatLauncher";
import { ChatProvider } from "./ChatProvider";

/**
 * The AI assistant on every page of the main site (ADR-072): one provider and
 * one chat panel in the root layout, with the floating "Ask Nutraboom
 * Equals" button. Pages can add their own launchers (the home hero) because
 * they share this provider.
 */
export function GlobalAssistant({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      {children}
      <ChatLauncher variant="floating" />
    </ChatProvider>
  );
}
