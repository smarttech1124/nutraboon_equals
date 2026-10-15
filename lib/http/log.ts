/**
 * Minimal structured request log (CLAUDE.md §28). Deliberately has no field
 * for message content so user text is never logged.
 */
export type ChatLogEntry = {
  requestId: string;
  conversationId?: string;
  intent?: string;
  provider?: string;
  aiLatencyMs?: number;
  outcome: "success" | "failure";
  errorCategory?: string;
  /** Number of foods matched to verified data (no names, to avoid logging user content). */
  foodsMatched?: number;
  /** Optional steps that failed while the turn still succeeded. */
  degraded?: string[];
  /** Reply safety-check outcome (counts and flags only). */
  safety?: { violations: number; regenerated: boolean; usedFallback: boolean };
};

export function logChat(entry: ChatLogEntry): void {
  const line = JSON.stringify({ event: "chat", ...entry });
  if (entry.outcome === "failure") console.error(line);
  else console.info(line);
}
