import { z } from "zod";
import { canonicalState } from "@/lib/budget/regions";
import { parseAvailability } from "./availability";
import { isSpecialization } from "./specializations";

/**
 * Nutritionist profile rules (ADR-064): form validation and what must be in
 * place before a profile can be submitted for verification.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(schema.nullable());

export const profileFormSchema = z.object({
  title: text(80).min(2, "Enter your professional title, e.g. Registered Dietitian."),
  bio: text(1200),
  specializations: z
    .array(z.string())
    .transform((list): string[] => [...new Set(list.filter(isSpecialization))])
    .pipe(
      z
        .array(z.string())
        .min(1, "Choose at least one specialisation.")
        .max(6, "Choose up to 6 specialisations."),
    ),
  expertise: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().max(40, "Keep each area of expertise under 40 characters."))
        .max(10, "List up to 10 areas of expertise."),
    ),
  yearsExperience: z.coerce
    .number({ error: "Enter your years of experience as a number." })
    .int("Enter whole years.")
    .min(0)
    .max(60, "Enter at most 60 years."),
  state: z
    .string()
    .transform((s) => canonicalState(s) ?? null)
    .pipe(z.string({ error: "Choose your state." })),
  city: text(60),
  sessionTypes: z
    .array(z.enum(["online", "in_person"]))
    .min(1, "Choose at least one session type."),
  sessionFee: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter the session fee in naira, e.g. 5000."),
  sessionMinutes: z.coerce.number().int().min(15, "Sessions are at least 15 minutes.").max(240),
  contactEmail: optionalText(z.email("Enter a valid contact email.").max(120)),
  contactPhone: optionalText(
    z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number."),
  ),
  whatsapp: optionalText(
    z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid WhatsApp number."),
  ),
});

export type ProfileForm = z.output<typeof profileFormSchema>;

export function readProfileForm(formData: FormData) {
  const all = (name: string) =>
    formData.getAll(name).filter((v): v is string => typeof v === "string");
  const one = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  const parsed = profileFormSchema.safeParse({
    title: one("title"),
    bio: one("bio"),
    specializations: all("specializations"),
    expertise: one("expertise"),
    yearsExperience: one("yearsExperience"),
    state: one("state"),
    city: one("city"),
    sessionTypes: all("sessionTypes"),
    sessionFee: one("sessionFee"),
    sessionMinutes: one("sessionMinutes") || "60",
    contactEmail: one("contactEmail"),
    contactPhone: one("contactPhone"),
    whatsapp: one("whatsapp"),
  });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const { sessionFee, ...rest } = parsed.data;
  return {
    ok: true as const,
    value: { ...rest, sessionFeeMinor: Math.round(Number(sessionFee) * 100) },
  };
}

export const qualificationFormSchema = z
  .object({
    kind: z.enum(["degree", "certification", "registration", "membership"]),
    title: text(120).min(2, "Enter the qualification's title."),
    institution: text(120).min(2, "Enter the awarding institution or body."),
    year: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(
        z
          .number()
          .int()
          .min(1950)
          .max(new Date().getUTCFullYear(), "The year cannot be in the future.")
          .nullable(),
      ),
    registrationNumber: optionalText(z.string().max(60)),
    expiresOn: optionalText(z.iso.date("Enter the expiry date as a date.")),
  })
  .refine((q) => q.kind !== "registration" || q.registrationNumber, {
    message: "Enter the registration or licence number.",
  });

export type ProfileFacts = {
  title: string;
  specializations: string[];
  state: string | null;
  sessionTypes: string[];
  sessionFeeMinor: number;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  availability: unknown;
  qualificationCount: number;
  documentCount: number;
};

/** What is still missing before the profile can be submitted, in plain words. */
export function missingForSubmission(p: ProfileFacts): string[] {
  const missing: string[] = [];
  if (
    p.title.trim().length < 2 ||
    p.specializations.length === 0 ||
    !p.state ||
    p.sessionTypes.length === 0
  ) {
    missing.push("Complete your profile: title, specialisations, state and session types.");
  }
  if (p.sessionFeeMinor <= 0) missing.push("Set your session fee.");
  if (!p.contactEmail && !p.contactPhone && !p.whatsapp) {
    missing.push("Add at least one way for clients to contact you.");
  }
  if (parseAvailability(p.availability).length === 0) missing.push("Add your weekly availability.");
  if (p.qualificationCount === 0) missing.push("Add at least one qualification.");
  if (p.documentCount === 0) missing.push("Upload at least one certificate or licence.");
  return missing;
}

/** Statuses in which the nutritionist may edit and (re)submit. */
export function canEdit(status: string): boolean {
  return status === "draft" || status === "changes_requested" || status === "verified";
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  verified: "Verified",
  rejected: "Not approved",
  suspended: "Suspended",
};
