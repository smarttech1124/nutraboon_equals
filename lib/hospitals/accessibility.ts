/**
 * Accessibility services a hospital offers, and needs a patient can state
 * (ADR-068). Patients are not assumed to share one set of needs: they choose
 * what applies to them, and hospitals say what they can do.
 */

export const ACCESS_SERVICES = {
  ne_text: "Talk to staff by text through Nutraboom Equals",
  ne_audio: "Speak to staff by voice through Nutraboom Equals",
  read_aloud: "Staff replies read aloud on your phone",
  wheelchair: "Step-free / wheelchair access",
  accessible_toilet: "Accessible toilet",
  guide_assistance: "Staff to guide you inside the hospital",
  large_print: "Large-print forms and information",
  quiet_space: "Quiet waiting space",
} as const;

export type AccessService = keyof typeof ACCESS_SERVICES;
export const ACCESS_SERVICE_KEYS = Object.keys(ACCESS_SERVICES) as AccessService[];

export function isAccessService(value: string): value is AccessService {
  return Object.hasOwn(ACCESS_SERVICES, value);
}

/** What a patient may ask for when booking. */
export const NEEDS = {
  text_communication: "I prefer to communicate by text",
  audio_communication: "I prefer to speak and listen",
  read_aloud: "Please read information aloud to me",
  wheelchair: "I use a wheelchair or need step-free access",
  guide: "I need someone to guide me inside",
  large_print: "I need large print",
  extra_time: "I need extra time",
} as const;

export type Need = keyof typeof NEEDS;
export const NEED_KEYS = Object.keys(NEEDS) as Need[];

export function isNeed(value: string): value is Need {
  return Object.hasOwn(NEEDS, value);
}
