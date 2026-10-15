import { normalizeText } from "@/lib/nutrition/match";

/**
 * Deterministic detection of safety-sensitive situations in a user message
 * (CLAUDE.md §22, ADR-041). The model also reports facts, but these checks
 * do not depend on it.
 */

function sentences(text: string): string[] {
  return text
    .split(/[.!?;\n]+/)
    .map((s) => normalizeText(s))
    .filter(Boolean);
}

function hasPhrase(sentence: string, phrases: readonly string[]): string | undefined {
  const padded = ` ${sentence} `;
  return phrases.find((p) => padded.includes(` ${p} `));
}

const NEGATION =
  /\b(not|no longer|never|isn t|aren t|am not|i m not|trying to get|planning to get|want to get|hoping to get|trying for)\b/;

export type PregnancyInfo = { pregnant: true; trimester?: 1 | 2 | 3 };

/** "I'm pregnant", "my wife is 20 weeks pregnant", "second trimester". */
export function detectPregnancy(message: string): PregnancyInfo | undefined {
  const all = sentences(message);
  // "I'm not pregnant" anywhere in the message wins.
  if (all.some((s) => /\bpregnant\b/.test(s) && NEGATION.test(s))) return undefined;

  for (const s of all) {
    // A statement that someone is pregnant, not a general question about pregnancy.
    const states =
      /\b(i m|i am|im|she is|she s|my wife is|my partner is|we re|we are|currently|just found out i m)\b( \w+){0,3} pregnant\b/.test(
        s,
      ) ||
      /\b\d{1,2} weeks? pregnant\b|\btrimester\b|\bexpecting a baby\b|\bmy pregnancy\b/.test(s);
    if (!states || NEGATION.test(s)) continue;

    let trimester: 1 | 2 | 3 | undefined;
    const t = /\b(first|1st|second|2nd|third|3rd) trimester\b/.exec(s);
    if (t) trimester = /first|1st/.test(t[1]) ? 1 : /second|2nd/.test(t[1]) ? 2 : 3;
    const weeks = /\b(\d{1,2}) weeks?\b/.exec(s);
    if (!trimester && weeks) {
      const w = Number(weeks[1]);
      if (w >= 1 && w <= 42) trimester = w <= 13 ? 1 : w <= 27 ? 2 : 3;
    }
    return trimester ? { pregnant: true, trimester } : { pregnant: true };
  }
  return undefined;
}

export function detectBreastfeeding(message: string): boolean {
  return sentences(message).some(
    (s) =>
      /\b(breastfeeding|breast feeding|nursing my baby|i m nursing)\b/.test(s) && !NEGATION.test(s),
  );
}

/**
 * Medical conditions that need conservative handling. Includes everyday
 * Nigerian phrasing ("I have sugar", "high BP", genotype "SS").
 */
export const CONDITIONS = {
  diabetes: {
    label: "diabetes",
    terms: [
      "diabetes",
      "diabetic",
      "blood sugar",
      "high sugar",
      "sugar patient",
      "sugar disease",
      "sugar problem",
      "sugar level",
      "sugar levels",
      "prediabetes",
      "pre diabetes",
    ],
  },
  hypertension: {
    label: "high blood pressure",
    terms: ["hypertension", "hypertensive", "high blood pressure", "high bp", "blood pressure"],
  },
  kidney_disease: {
    label: "kidney disease",
    terms: [
      "kidney disease",
      "kidney failure",
      "kidney problem",
      "kidney problems",
      "ckd",
      "dialysis",
      "renal",
    ],
  },
  sickle_cell: {
    label: "sickle cell disease",
    terms: ["sickle cell", "genotype ss", "sickler", "sickle cell anaemia", "sickle cell anemia"],
  },
  heart_disease: {
    label: "heart disease",
    terms: ["heart disease", "heart failure", "heart problem", "heart attack", "stroke"],
  },
  eating_disorder: {
    label: "an eating disorder",
    terms: [
      "eating disorder",
      "anorexia",
      "anorexic",
      "bulimia",
      "bulimic",
      "binge eating",
      "starving myself",
      "make myself vomit",
    ],
  },
  malnutrition: {
    label: "malnutrition",
    terms: ["malnutrition", "malnourished", "kwashiorkor", "marasmus", "severely underweight"],
  },
  stomach_ulcer: { label: "a stomach ulcer", terms: ["ulcer", "peptic ulcer", "stomach ulcer"] },
  gout: { label: "gout", terms: ["gout"] },
  cancer: { label: "cancer", terms: ["cancer", "chemotherapy", "chemo"] },
} as const;

export type ConditionKey = keyof typeof CONDITIONS;

/** Conditions mentioned in a message. Mentions count: being conservative is the point. */
export function detectConditions(text: string): ConditionKey[] {
  const found = new Set<ConditionKey>();
  for (const s of sentences(text)) {
    for (const [key, { terms }] of Object.entries(CONDITIONS) as [
      ConditionKey,
      (typeof CONDITIONS)[ConditionKey],
    ][]) {
      if (hasPhrase(s, terms)) found.add(key);
    }
  }
  return [...found];
}

export function conditionLabel(key: string): string {
  return key in CONDITIONS ? CONDITIONS[key as ConditionKey].label : key;
}

/** Medicines and supplements people mention, including common Nigerian ones. */
export const MEDICATION_TERMS = [
  "medication",
  "medications",
  "medicine",
  "medicines",
  "drug",
  "drugs",
  "tablet",
  "tablets",
  "pill",
  "pills",
  "capsule",
  "capsules",
  "injection",
  "supplement",
  "supplements",
  "multivitamin",
  "multivitamins",
  "insulin",
  "metformin",
  "glibenclamide",
  "amlodipine",
  "lisinopril",
  "nifedipine",
  "warfarin",
  "hydroxyurea",
  "folic acid",
  "iron tablets",
  "ferrous",
  "fefol",
  "paracetamol",
  "aspirin",
  "agbo",
] as const;

export function detectMedication(text: string): boolean {
  return sentences(text).some((s) => hasPhrase(s, MEDICATION_TERMS) !== undefined);
}

/**
 * Signs that someone needs urgent care now. When any appear, the app shows
 * an urgent-care notice regardless of what the model writes.
 */
export const RED_FLAGS = [
  "can t breathe",
  "cannot breathe",
  "difficulty breathing",
  "trouble breathing",
  "struggling to breathe",
  "short of breath",
  "swollen lips",
  "swollen tongue",
  "swollen throat",
  "throat is closing",
  "face is swelling",
  "lips are swelling",
  "anaphylaxis",
  "anaphylactic",
  "unconscious",
  "passed out",
  "not waking",
  "won t wake",
  "fainted",
  "seizure",
  "seizures",
  "convulsion",
  "convulsions",
  "vomiting blood",
  "blood in stool",
  "blood in her stool",
  "blood in his stool",
  "bloody stool",
  "chest pain",
  "severe dehydration",
  "no urine",
  "not urinating",
  "sunken eyes",
  "very weak",
  "floppy",
  "refusing to feed",
  "not feeding",
  "bleeding in pregnancy",
  "vaginal bleeding",
  "bleeding while pregnant",
  "severe abdominal pain",
  "severe stomach pain",
  "baby is not moving",
  "baby stopped moving",
  "high fever",
  "suicidal",
  "kill myself",
] as const;

export function detectRedFlags(message: string): string[] {
  const found = new Set<string>();
  for (const s of sentences(message)) {
    const padded = ` ${s} `;
    for (const flag of RED_FLAGS) if (padded.includes(` ${flag} `)) found.add(flag);
  }
  return [...found];
}

/** Nigeria's national emergency number. */
export const EMERGENCY_NUMBER = "112";

export function urgentCareNotice(flags: string[]): string | undefined {
  if (flags.length === 0) return undefined;
  if (flags.some((f) => f === "suicidal" || f === "kill myself")) {
    return `If you are thinking about harming yourself, please reach out now: call ${EMERGENCY_NUMBER}, go to the nearest hospital, or talk to someone you trust. You don't have to face this alone.`;
  }
  return `This sounds like it may need urgent medical care. Please go to the nearest hospital or health centre now, or call ${EMERGENCY_NUMBER}.`;
}
