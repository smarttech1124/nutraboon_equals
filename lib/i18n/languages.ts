/**
 * Reply languages a user can choose (ADR-050). Shared by the browser (settings,
 * voice) and the server (prompt). Yoruba and Igbo are Beta: replies are
 * AI-translated and not yet reviewed, and app-written safety notices stay in
 * English.
 */
export const LANGUAGES = [
  { code: "en-NG", label: "Nigerian English", promptName: "Nigerian English", beta: false },
  { code: "en-GB", label: "UK English", promptName: "British English", beta: false },
  { code: "en-US", label: "US English", promptName: "American English", beta: false },
  { code: "yo-NG", label: "Yorùbá", promptName: "Yoruba", beta: true },
  { code: "ig-NG", label: "Igbo", promptName: "Igbo", beta: true },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: LanguageCode = "en-NG";

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function languageOf(code: LanguageCode | undefined): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** True for the English variants, which need no separate safety-check text. */
export function isEnglish(code: LanguageCode | undefined): boolean {
  return (code ?? DEFAULT_LANGUAGE).startsWith("en");
}
