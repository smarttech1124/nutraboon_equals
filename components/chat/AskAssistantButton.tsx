"use client";

import { useChatPanel } from "./ChatProvider";

/** Opens the global assistant from anywhere inside the root layout (ADR-072). */
export function AskAssistantButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { isOpen, open } = useChatPanel();
  return (
    <button
      type="button"
      onClick={(e) => open(e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      className={className}
    >
      {children}
    </button>
  );
}
