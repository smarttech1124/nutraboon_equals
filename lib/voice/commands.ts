import { normalizeText } from "@/lib/nutrition/match";

/**
 * Spoken replies to "I heard: …. Say send to send it, or again to record it
 * again." (ADR-057). Only short, whole replies count, so a longer sentence
 * that happens to contain "send" is never taken as a command.
 */
export type VoiceCommand = "send" | "again" | "cancel";

const COMMANDS: { command: VoiceCommand; phrases: string[] }[] = [
  {
    command: "send",
    phrases: [
      "send",
      "send it",
      "yes",
      "yes send",
      "yes send it",
      "ok send",
      "okay send",
      "correct",
      "that is right",
      "thats right",
    ],
  },
  {
    command: "again",
    phrases: ["again", "try again", "record again", "say it again", "no", "redo", "start again"],
  },
  {
    command: "cancel",
    phrases: ["cancel", "stop", "never mind", "nevermind", "don't send", "dont send"],
  },
];

export function parseVoiceCommand(text: string): VoiceCommand | undefined {
  const said = normalizeText(text)
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!said || said.split(" ").length > 4) return undefined;
  for (const { command, phrases } of COMMANDS) {
    if (phrases.some((p) => said === normalizeText(p) || said === `${normalizeText(p)} please`)) {
      return command;
    }
  }
  return undefined;
}
