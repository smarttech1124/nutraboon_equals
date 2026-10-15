import { getEntitlementService } from "@/lib/billing";
import { grantCounts } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";
import { photoThumbnail } from "@/lib/storage/cloudinary";
import { describeAvailability, parseAvailability } from "./availability";
import { rankCandidates, type MatchQuery } from "./matching";
import { SPECIALIZATIONS, isSpecialization } from "./specializations";

/**
 * The public nutritionist directory (ADR-064). A nutritionist is listed only
 * when the Nutritionists feature is on, their account is active, their
 * profile is verified, and they are entitled to a listing (free tier or plan).
 */

export type { NutritionistCard } from "./types";
import type { NutritionistCard } from "./types";

const SELECT = {
  userId: true,
  title: true,
  specializations: true,
  yearsExperience: true,
  state: true,
  city: true,
  sessionTypes: true,
  sessionFeeMinor: true,
  sessionMinutes: true,
  availability: true,
  photoUrl: true,
  verifiedAt: true,
  user: { select: { name: true } },
  qualifications: {
    where: { kind: { in: ["degree", "registration"] as ("degree" | "registration")[] } },
    select: { title: true },
    take: 2,
  },
} as const;

/** User ids among `candidates` whose listing is paid for by a counting subscription. */
async function entitledByPlan(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const [subs, graceDays] = await Promise.all([
    getPrisma().subscription.findMany({
      where: {
        userId: { in: candidates },
        status: { in: ["active", "past_due"] },
        plan: { entitlements: { path: ["nutritionist.listing"], equals: true } },
      },
      select: { userId: true, status: true, currentPeriodEnd: true, graceUntil: true },
    }),
    getEntitlementService().graceDays(),
  ]);
  const now = new Date();
  return new Set(
    subs
      .filter((s) => grantCounts({ ...s, entitlements: {} }, now, graceDays))
      .map((s) => s.userId!),
  );
}

async function listedProfiles(where: { userId?: string } = {}) {
  const service = getEntitlementService();
  if (!(await service.isEnabled("nutritionists"))) return [];
  const profiles = await getPrisma().nutritionistProfile.findMany({
    where: { ...where, status: "verified", user: { status: "active" } },
    select: SELECT,
  });
  if ((await service.freeTier())["nutritionist.listing"]) return profiles;
  const paid = await entitledByPlan(profiles.map((p) => p.userId));
  return profiles.filter((p) => paid.has(p.userId));
}

function toCard(p: Awaited<ReturnType<typeof listedProfiles>>[number]): NutritionistCard {
  return {
    id: p.userId,
    name: p.user.name,
    title: p.title,
    photoUrl: p.photoUrl ? photoThumbnail(p.photoUrl) : null,
    specializations: p.specializations.filter(isSpecialization).map((s) => SPECIALIZATIONS[s]),
    qualificationSummary: p.qualifications.map((q) => q.title),
    state: p.state,
    city: p.city,
    yearsExperience: p.yearsExperience,
    sessionTypes: p.sessionTypes,
    sessionFeeMinor: p.sessionFeeMinor,
    sessionMinutes: p.sessionMinutes,
    availability: describeAvailability(parseAvailability(p.availability)),
  };
}

export async function findNutritionists(
  query: MatchQuery,
  limit = 30,
): Promise<NutritionistCard[]> {
  const ranked = rankCandidates(await listedProfiles(), query);
  return ranked.slice(0, limit).map(toCard);
}

/** The card of one listed nutritionist, or null when they are not listed. */
export async function listedNutritionist(userId: string): Promise<NutritionistCard | null> {
  const [profile] = await listedProfiles({ userId });
  return profile ? toCard(profile) : null;
}
