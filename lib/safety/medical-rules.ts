import { normalizeText } from "@/lib/nutrition/match";
import type { SafetyViolation } from "./reply-check";

/**
 * Medical safety rules checked in code on every reply (CLAUDE.md §22,
 * ADR-041). Each rule is narrow and well established; the model is still
 * told the broader policy in the prompt.
 */

function sentences(text: string): string[] {
  return text
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DOSE_AMOUNT = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|iu|units?|milligrams?|micrograms?)\b/i;
const DOSE_CONTEXT =
  /\b(supplements?|tablets?|capsules?|pills?|doses?|dosage|medications?|medicines?|drugs?|injections?|insulin|metformin|folic acid|iron tablets|multivitamins?|vitamin pills?)\b/i;

/**
 * "Take 400 mcg of folic acid", "60 mg iron tablets daily". Nutrition facts
 * ("vitamin C 60 mg") are not doses: they never sit next to a medicine word.
 */
export function findDoseStatements(message: string): string[] {
  return sentences(message).filter((s) => DOSE_AMOUNT.test(s) && DOSE_CONTEXT.test(s));
}

/**
 * Any medicine word or dose amount. For text that should never touch
 * medicines at all, such as the hospital routing agent's replies (ADR-068).
 */
export function mentionsMedicine(text: string): boolean {
  return DOSE_AMOUNT.test(text) || DOSE_CONTEXT.test(text);
}

const DOSE_AMOUNTS = new RegExp(DOSE_AMOUNT.source, "gi");
const doseKey = (amount: string) => amount.toLowerCase().replace(/\s+/g, "").replace(",", ".");

/**
 * Medication literacy (ADR-055): repeating a dose the user stated themselves
 * ("your 5 mg folic acid tablet, once a day") helps them understand their
 * own instructions. A sentence passes only if every dose in it is one the
 * user gave.
 */
export function isUserStatedDose(sentence: string, userText: string): boolean {
  const stated = new Set((userText.match(DOSE_AMOUNTS) ?? []).map(doseKey));
  const amounts = (sentence.match(DOSE_AMOUNTS) ?? []).map(doseKey);
  return amounts.length > 0 && amounts.every((a) => stated.has(a));
}

const MED_OBJECT =
  "(medications?|medicines?|drugs?|tablets?|pills?|insulin|metformin|dose|dosage|injections?|treatment)";
const CHANGE_VERB =
  "(stop|stopping|reduce|reducing|lower|lowering|cut down|cutting down|cut back|skip|skipping|double|doubling|increase|increasing|raise|raising|adjust|adjusting|change|changing|switch|switching|quit|quitting|come off|coming off|replace|replacing)";
const MED_CHANGE = new RegExp(`\\b${CHANGE_VERB}\\b[^.]{0,40}\\b${MED_OBJECT}\\b`, "i");
/**
 * Framing that makes a medication change safe to mention, when it comes
 * before the change: "Don't stop your metformin", "Ask your doctor before
 * reducing your insulin", "Before changing your dose, talk to your doctor".
 */
const SAFE_FRAMING =
  /\b(don'?t|do not|never|not|before|without (first )?(talking|speaking|checking)|talk to|speak to|speak with|check with|ask)\b/i;

/** Advice to start, stop or change medication. Only a clinician may give it. */
export function findMedicationChanges(message: string): string[] {
  return sentences(message).filter((s) => {
    const change = MED_CHANGE.exec(s);
    if (!change) return false;
    const framing = SAFE_FRAMING.exec(s);
    return !(framing && framing.index < change.index);
  });
}

function containsPhrase(text: string, phrase: string): boolean {
  const words = ` ${normalizeText(text)} `;
  return words.includes(` ${phrase} `) || words.includes(` ${phrase}s `);
}

/**
 * Foods to avoid in pregnancy, after NHS "Foods to avoid in pregnancy" and
 * WHO antenatal guidance: alcohol (including palm wine and local brews),
 * liver, unpasteurised or raw milk (e.g. nono), raw or undercooked eggs,
 * meat and fish, and high-mercury fish.
 */
export const PREGNANCY_AVOID: { terms: string[]; reason: string }[] = [
  {
    terms: [
      "alcohol",
      "palm wine",
      "beer",
      "wine",
      "burukutu",
      "pito",
      "ogogoro",
      "kai kai",
      "schnapps",
      "spirits",
    ],
    reason: "alcohol is not safe in pregnancy",
  },
  {
    terms: ["liver", "pate", "cod liver oil"],
    reason: "liver is too high in vitamin A for pregnancy",
  },
  {
    terms: ["raw milk", "unpasteurised milk", "unpasteurized milk", "nono", "fura da nono"],
    reason: "raw or unpasteurised milk is not safe in pregnancy",
  },
  {
    terms: ["raw egg", "runny egg", "soft boiled egg", "half boiled egg", "undercooked egg"],
    reason: "eggs should be fully cooked in pregnancy",
  },
  {
    terms: [
      "raw meat",
      "rare meat",
      "undercooked meat",
      "rare steak",
      "raw fish",
      "sushi",
      "undercooked fish",
    ],
    reason: "meat and fish should be fully cooked in pregnancy",
  },
  { terms: ["shark", "swordfish", "marlin"], reason: "this fish is high in mercury" },
  { terms: ["agbo"], reason: "herbal mixtures are not safe to suggest in pregnancy" },
];

export type MedicalContext = {
  pregnant?: boolean;
  /** Every person being planned for is under 6 months old. */
  onlyBabiesUnder6Months?: boolean;
  /** Everything the user said in this conversation, for doses they stated themselves. */
  userText?: string;
};

export function checkMedicalRules(
  reply: { message: string; suggested: string[] },
  context: MedicalContext,
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  for (const s of findDoseStatements(reply.message)) {
    if (context.userText && isUserStatedDose(s, context.userText)) continue;
    violations.push({
      kind: "medication",
      term: s.slice(0, 60),
      reason:
        "it gives a medication or supplement dose the user did not state; never suggest a dose, only repeat the one in their own instructions, and refer to their doctor, pharmacist or antenatal clinic",
    });
  }
  for (const s of findMedicationChanges(reply.message)) {
    violations.push({
      kind: "medication",
      term: s.slice(0, 60),
      reason:
        "it advises changing medication; only their doctor can, so say to keep taking it as prescribed and ask their doctor",
    });
  }

  if (context.pregnant) {
    for (const item of reply.suggested) {
      for (const rule of PREGNANCY_AVOID) {
        const term = rule.terms.find((t) => containsPhrase(item, t));
        if (term) violations.push({ kind: "medical", term, reason: rule.reason });
      }
    }
  }

  if (context.onlyBabiesUnder6Months && reply.suggested.length > 0) {
    violations.push({
      kind: "child_safety",
      term: reply.suggested.slice(0, 3).join(", "),
      reason:
        "babies under 6 months should have only breast milk or infant formula (WHO); suggest no foods and refer to a child welfare clinic",
    });
  }
  return violations;
}
