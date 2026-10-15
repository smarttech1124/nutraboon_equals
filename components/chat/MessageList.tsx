"use client";

import { useEffect, useRef } from "react";
import { LoadingIndicator } from "./LoadingIndicator";
import { MessageBubble } from "./MessageBubble";
import type { UIMessage } from "./useChat";

/** Read-aloud controls; absent where the browser cannot speak. */
export type ListenControls = {
  speakingId?: string;
  onListen: (message: UIMessage) => void;
};

type Props = {
  messages: UIMessage[];
  isLoading: boolean;
  listen?: ListenControls;
  /** Show a sign-language response with replies (ADR-077). */
  signLanguage?: boolean;
};

export function MessageList({ messages, isLoading, listen, signLanguage = false }: Props) {
  const latestReply = messages.findLast((m) => m.role === "assistant")?.id;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, isLoading]);

  return (
    <div role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          listen={listen}
          sign={signLanguage ? { latest: m.id === latestReply } : undefined}
        />
      ))}
      {isLoading && <LoadingIndicator />}
      <div ref={endRef} />
    </div>
  );
}
