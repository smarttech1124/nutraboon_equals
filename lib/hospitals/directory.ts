import { getEntitlementService } from "@/lib/billing";
import { grantCounts } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";
import { distanceKm } from "@/lib/geo/distance";

/**
 * The hospital directory (ADR-068). A hospital is listed only when the
 * Hospitals feature is on, it is verified, and it holds the hospital.listing
 * entitlement (free tier or a hospital plan held by the organisation).
 */

export type HospitalCard = {
  id: string;
  name: string;
  area: string;
  city: string;
  state: string | null;
  accessibility: string[];
  departments: string[];
  /** Kilometres from the searched place, when there is one and the hospital has a location. */
  distanceKm: number | null;
  phone: string | null;
};

export type HospitalQuery = {
  near?: { latitude: number; longitude: number } | null;
  /** km; undefined or null means anywhere. */
  radiusKm?: number | null;
  /** Used when there is no location: hospitals in this state. */
  state?: string | null;
  department?: string;
  access?: string[];
};

async function entitledHospitals(orgIds: string[]): Promise<Set<string>> {
  if (orgIds.length === 0) return new Set();
  const service = getEntitlementService();
  if ((await service.freeTier())["hospital.listing"]) return new Set(orgIds);
  const [subs, graceDays] = await Promise.all([
    getPrisma().subscription.findMany({
      where: {
        organizationId: { in: orgIds },
        status: { in: ["active", "past_due"] },
        plan: { entitlements: { path: ["hospital.listing"], equals: true } },
      },
      select: { organizationId: true, status: true, currentPeriodEnd: true, graceUntil: true },
    }),
    service.graceDays(),
  ]);
  const now = new Date();
  return new Set(
    subs
      .filter((s) => grantCounts({ ...s, entitlements: {} }, now, graceDays))
      .map((s) => s.organizationId!),
  );
}

async function listedHospitals(where: { organizationId?: string } = {}) {
  if (!(await getEntitlementService().isEnabled("hospitals"))) return [];
  const rows = await getPrisma().hospitalProfile.findMany({
    where: { ...where, status: "verified", organization: { kind: "hospital" } },
    include: {
      organization: {
        select: {
          name: true,
          departments: {
            where: { active: true },
            select: { name: true },
            orderBy: { name: "asc" },
          },
        },
      },
    },
    take: 1000,
  });
  const entitled = await entitledHospitals(rows.map((r) => r.organizationId));
  return rows.filter((r) => entitled.has(r.organizationId));
}

export async function findHospitals(query: HospitalQuery): Promise<HospitalCard[]> {
  const rows = await listedHospitals();
  const dept = query.department?.trim().toLowerCase();
  const cards = rows.flatMap((r) => {
    if (query.access?.length && !query.access.every((a) => r.accessibility.includes(a))) return [];
    const departments = r.organization.departments.map((d) => d.name);
    if (dept && !departments.some((d) => d.toLowerCase().includes(dept))) return [];
    const distance =
      query.near && r.latitude !== null && r.longitude !== null
        ? distanceKm(query.near, { latitude: r.latitude, longitude: r.longitude })
        : null;
    if (query.near && query.radiusKm) {
      // Within the radius; a hospital without a location cannot be placed, so it is left out.
      if (distance === null || distance > query.radiusKm) return [];
    } else if (!query.near && query.state && r.state !== query.state) {
      return [];
    }
    return [
      {
        id: r.organizationId,
        name: r.organization.name,
        area: r.area,
        city: r.city,
        state: r.state,
        accessibility: r.accessibility,
        departments,
        distanceKm: distance === null ? null : Math.round(distance * 10) / 10,
        phone: r.phone,
      } satisfies HospitalCard,
    ];
  });
  return cards
    .sort(
      (a, b) =>
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 50);
}

export async function isListedHospital(id: string): Promise<boolean> {
  return (await listedHospitals({ organizationId: id })).length > 0;
}
