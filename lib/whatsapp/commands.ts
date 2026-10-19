/**
 * WhatsApp commands (ADR-090). People can type them in any case, with or
 * without a leading "/" (WhatsApp's command menu, set up by
 * `npm run whatsapp:setup`, sends "/sign_on" and so on). Only a message that
 * is exactly a command counts, so "stop giving me rice" is a question.
 *
 * SIGN ON / SIGN OFF are opting in and out of messages, with START and STOP
 * kept as the words people expect on WhatsApp. The sign-language demo video
 * is VIDEO ON / VIDEO OFF, so the two cannot be confused.
 */

export type Command =
  "help" | "opt_in" | "opt_out" | "reset" | "voice_on" | "voice_off" | "video_on" | "video_off";

const WORDS: Record<string, Command> = {
  help: "help",
  menu: "help",
  commands: "help",
  "sign on": "opt_in",
  signon: "opt_in",
  start: "opt_in",
  subscribe: "opt_in",
  "opt in": "opt_in",
  optin: "opt_in",
  resume: "opt_in",
  "sign off": "opt_out",
  signoff: "opt_out",
  stop: "opt_out",
  unsubscribe: "opt_out",
  "opt out": "opt_out",
  optout: "opt_out",
  cancel: "opt_out",
  reset: "reset",
  "new chat": "reset",
  "start over": "reset",
  "voice on": "voice_on",
  "voice off": "voice_off",
  "video on": "video_on",
  "sign video on": "video_on",
  "sign language on": "video_on",
  "video off": "video_off",
  "sign video off": "video_off",
  "sign language off": "video_off",
};

export function parseCommand(text: string | null | undefined): Command | null {
  if (!text) return null;
  const normalized = text
    .trim()
    .replace(/^\//, "")
    .replace(/[.!]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return Object.hasOwn(WORDS, normalized) ? WORDS[normalized] : null;
}

/** WhatsApp's "/" command menu: names up to 32 characters, hints up to 256, at most 30. */
export const COMMAND_MENU = [
  { command_name: "help", command_description: "What I can do and the commands you can use" },
  { command_name: "reset", command_description: "Forget this conversation and start again" },
  { command_name: "voice_on", command_description: "Get every reply as a voice message too" },
  { command_name: "voice_off", command_description: "Text replies only" },
  {
    command_name: "video_on",
    command_description: "Sample sign-language video after replies (demo, not a translation)",
  },
  { command_name: "video_off", command_description: "Stop the sign-language demo video" },
  { command_name: "sign_off", command_description: "Stop all messages from Nutraboom Equals" },
  { command_name: "sign_on", command_description: "Start messages again after SIGN OFF" },
];

/** Ice breakers shown when someone opens the chat: at most 4, 80 characters each, no emoji. */
export const ICE_BREAKERS = [
  "What's the nutrition in an orange?",
  "I have ₦2,000. What can I cook?",
  "Help me plan meals for my family",
  "What can I make with rice and beans?",
];

/** The business profile (npm run whatsapp:setup). WhatsApp's limits: About 139 characters, description 512. */
export const PROFILE_ABOUT =
  "Nutrition help for Nigeria: foods, meal plans and budgets. Not medical advice.";
export const PROFILE_DESCRIPTION =
  "Equals, the Nutraboom Equals assistant, answers questions about food, plans meals for your household and helps you cook on a budget, in text or voice notes. Send HELP for commands, RESET to start again, SIGN OFF to stop messages. General nutrition information, not medical advice: in an emergency, call 112.";
