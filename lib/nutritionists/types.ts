/** A listed nutritionist as shown in the directory and in chat (ADR-064). */
export type NutritionistCard = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  specializations: string[];
  qualificationSummary: string[];
  state: string | null;
  city: string;
  yearsExperience: number;
  sessionTypes: ("online" | "in_person")[];
  sessionFeeMinor: number;
  sessionMinutes: number;
  availability: string[];
};

/** Finds nutritionists for a chat referral; the app decides who, never the AI. */
export type NutritionistFinder = (query: {
  specializations: string[];
  state: string | null;
}) => Promise<NutritionistCard[]>;
