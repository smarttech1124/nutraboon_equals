import { GeminiSpeechToText } from "./gemini";
import {
  DEFAULT_TRANSCRIBE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  OpenAISpeechToText,
  OpenAITextToSpeech,
} from "./openai";
import { SpeechError, type Audio, type SpeechToText, type TextToSpeech } from "./types";

export { SpeechError } from "./types";
export type { Audio, SpeechToText, TextToSpeech } from "./types";

/**
 * Server speech providers (ADR-090). To add one, implement SpeechToText
 * and/or TextToSpeech in its own file, list it here and add a case to
 * `create`. The order and choice come from the environment:
 *
 *   SPEECH_TO_TEXT_PROVIDERS=gemini,openai   tried in order until one works
 *   TEXT_TO_SPEECH_PROVIDER=openai           or "off"
 *
 * Keys are the AI keys the app already has: the environment variable, else
 * the active key saved in n-equals when it is for the same provider.
 */
export const SPEECH_PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    speechToText: true,
    textToSpeech: false,
    keyEnv: ["GEMINI_API_KEY"],
    note: "Transcribes voice notes and the speech in videos.",
  },
  openai: {
    label: "OpenAI",
    speechToText: true,
    textToSpeech: true,
    keyEnv: ["OPENAI_API_KEY"],
    note: "Transcription and spoken replies (MP3).",
  },
  claude: {
    label: "Anthropic Claude",
    speechToText: false,
    textToSpeech: false,
    keyEnv: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
    note: "The Claude API reads text, images and PDFs but not audio, so it cannot transcribe. Listed so it can be switched on if that changes.",
  },
} as const;

export type SpeechProviderName = keyof typeof SPEECH_PROVIDERS;

export const DEFAULT_SPEECH_TO_TEXT: SpeechProviderName[] = ["gemini", "openai"];
export const DEFAULT_TEXT_TO_SPEECH: SpeechProviderName = "openai";

export function isSpeechProvider(value: string): value is SpeechProviderName {
  return Object.hasOwn(SPEECH_PROVIDERS, value);
}

/** "gemini, openai" → ["gemini", "openai"]; unknown names are dropped. */
export function parseProviderList(
  value: string | undefined,
  fallback: SpeechProviderName[],
): SpeechProviderName[] {
  if (!value?.trim()) return fallback;
  const names = value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(isSpeechProvider);
  return [...new Set(names)];
}

export type KeyLookup = (provider: SpeechProviderName) => Promise<string | null>;

type Env = Record<string, string | undefined>;

/** The environment key for a provider, if set. */
export function envKey(provider: SpeechProviderName, env: Env = process.env): string | null {
  for (const name of SPEECH_PROVIDERS[provider].keyEnv) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function createSpeechToText(name: SpeechProviderName, key: string, env: Env): SpeechToText | null {
  switch (name) {
    case "gemini":
      return new GeminiSpeechToText(
        key,
        env.GEMINI_TRANSCRIBE_MODEL || env.GEMINI_MODEL || undefined,
      );
    case "openai":
      return new OpenAISpeechToText(key, env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
    default:
      return null;
  }
}

function createTextToSpeech(name: SpeechProviderName, key: string, env: Env): TextToSpeech | null {
  if (name !== "openai") return null;
  return new OpenAITextToSpeech(
    key,
    env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
    env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE,
  );
}

/** Logs which provider failed and why: category and status only, never audio or text. */
function logFailure(provider: string, error: unknown) {
  console.warn(
    JSON.stringify({
      event: "speech_provider_failed",
      provider,
      category: error instanceof SpeechError ? error.category : "provider",
      status: error instanceof SpeechError ? error.status : null,
    }),
  );
}

/**
 * Tries each provider in order. "No speech" is final (another provider would
 * hear the same silence); any other failure moves on to the next.
 */
export class FallbackSpeechToText implements SpeechToText {
  readonly name: string;

  constructor(private readonly providers: SpeechToText[]) {
    this.name = providers.map((p) => p.name).join(",");
  }

  async transcribe(audio: Audio): Promise<string> {
    let last: unknown = new SpeechError("No speech-to-text provider", "config");
    for (const provider of this.providers) {
      try {
        return await provider.transcribe(audio);
      } catch (error) {
        if (error instanceof SpeechError && error.category === "empty") throw error;
        logFailure(provider.name, error);
        last = error;
      }
    }
    throw last;
  }
}

/** The configured speech-to-text chain, or null when no provider has a key. */
export async function buildSpeechToText(
  keyFor: KeyLookup,
  env: Env = process.env,
): Promise<SpeechToText | null> {
  const providers: SpeechToText[] = [];
  for (const name of parseProviderList(env.SPEECH_TO_TEXT_PROVIDERS, DEFAULT_SPEECH_TO_TEXT)) {
    if (!SPEECH_PROVIDERS[name].speechToText) continue;
    const key = await keyFor(name).catch(() => null);
    const provider = key ? createSpeechToText(name, key, env) : null;
    if (provider) providers.push(provider);
  }
  return providers.length > 0 ? new FallbackSpeechToText(providers) : null;
}

/** The configured text-to-speech provider, or null when off or without a key. */
export async function buildTextToSpeech(
  keyFor: KeyLookup,
  env: Env = process.env,
): Promise<TextToSpeech | null> {
  const value = (env.TEXT_TO_SPEECH_PROVIDER ?? DEFAULT_TEXT_TO_SPEECH).trim().toLowerCase();
  if (!isSpeechProvider(value) || !SPEECH_PROVIDERS[value].textToSpeech) return null;
  const key = await keyFor(value).catch(() => null);
  return key ? createTextToSpeech(value, key, env) : null;
}

/** What n-equals shows: each provider, whether it is in the chain and has a key. */
export async function describeSpeechSetup(keyFor: KeyLookup, env: Env = process.env) {
  const order = parseProviderList(env.SPEECH_TO_TEXT_PROVIDERS, DEFAULT_SPEECH_TO_TEXT);
  const tts = (env.TEXT_TO_SPEECH_PROVIDER ?? DEFAULT_TEXT_TO_SPEECH).trim().toLowerCase();
  return Promise.all(
    (Object.keys(SPEECH_PROVIDERS) as SpeechProviderName[]).map(async (name) => ({
      name,
      ...SPEECH_PROVIDERS[name],
      speechToTextPosition:
        SPEECH_PROVIDERS[name].speechToText && order.includes(name)
          ? order.indexOf(name) + 1
          : null,
      usedForSpeech: tts === name && SPEECH_PROVIDERS[name].textToSpeech,
      hasKey: (await keyFor(name).catch(() => null)) !== null,
    })),
  );
}
