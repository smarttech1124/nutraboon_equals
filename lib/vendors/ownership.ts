import { getPrisma } from "@/lib/db";

/** Prisma filter: an organisation this user owns (ADR-067). */
export function ownerOf(userId: string) {
  return { memberships: { some: { userId, role: "owner" as const } } };
}

/** The organisation of this kind the user owns, if any. One per kind per account for now. */
export async function ownedOrgId(
  userId: string,
  kind: "vendor" | "hospital",
): Promise<string | null> {
  const org = await getPrisma().organization.findFirst({
    where: { kind, ...ownerOf(userId) },
    select: { id: true },
  });
  return org?.id ?? null;
}

/** The vendor business this user owns, if any. */
export function ownedVendorOrgId(userId: string): Promise<string | null> {
  return ownedOrgId(userId, "vendor");
}

/** For a vendor or hospital plan: the organisation that holds it (ADR-067, ADR-068). */
export async function planHolderOrgId(userId: string, audience: string): Promise<string | null> {
  return audience === "vendor" || audience === "hospital" ? ownedOrgId(userId, audience) : null;
}
