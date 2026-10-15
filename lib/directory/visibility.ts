import { getEntitlementService } from "@/lib/billing";
import type { EntitlementService } from "@/lib/billing/service";
import { getPrisma } from "@/lib/db";

/**
 * Why a verified partner is or is not on the public site (ADR-082). The
 * directories (lib/hospitals/directory.ts, lib/nutritionists/directory.ts,
 * lib/vendors/directory.ts) list a record only when its module is switched
 * on, it is verified, and it holds the listing entitlement (free tier or a
 * partner plan). Administrators verify a record and then wonder why it is not
 * shown; this answers that, with each missing condition.
 */

export type ListingReason =
  "module_off" | "not_verified" | "no_listing_plan" | "account_suspended" | "vendor_not_listed";

export type ListingStatus = { listed: boolean; reasons: ListingReason[] };

export const LISTING_REASON_TEXT: Record<ListingReason, string> = {
  module_off:
    "The module is switched off in Settings, so its public directory shows “Coming soon”.",
  not_verified: "It is not verified yet.",
  no_listing_plan:
    "It has no listing entitlement: no active partner plan that includes listing, and the free tier does not include it.",
  account_suspended: "The account is suspended.",
  vendor_not_listed: "The vendor business itself is not listed (see the vendor's status).",
};

function status(reasons: ListingReason[]): ListingStatus {
  return { listed: reasons.length === 0, reasons };
}

export async function hospitalListing(
  organizationId: string,
  service: EntitlementService = getEntitlementService(),
): Promise<ListingStatus> {
  const [on, profile, entitlements] = await Promise.all([
    service.isEnabled("hospitals"),
    getPrisma().hospitalProfile.findUnique({
      where: { organizationId },
      select: { status: true },
    }),
    service.entitlementsFor({ organizationId }),
  ]);
  const reasons: ListingReason[] = [];
  if (!on) reasons.push("module_off");
  if (profile?.status !== "verified") reasons.push("not_verified");
  if (!entitlements["hospital.listing"]) reasons.push("no_listing_plan");
  return status(reasons);
}

export async function vendorListing(
  organizationId: string,
  service: EntitlementService = getEntitlementService(),
): Promise<ListingStatus> {
  const [on, profile, entitlements] = await Promise.all([
    service.isEnabled("vendors"),
    getPrisma().vendorProfile.findUnique({ where: { organizationId }, select: { status: true } }),
    service.entitlementsFor({ organizationId }),
  ]);
  const reasons: ListingReason[] = [];
  if (!on) reasons.push("module_off");
  if (profile?.status !== "verified") reasons.push("not_verified");
  if (!entitlements["vendor.listing"]) reasons.push("no_listing_plan");
  return status(reasons);
}

export async function productListing(
  productId: string,
  service: EntitlementService = getEntitlementService(),
): Promise<ListingStatus> {
  const product = await getPrisma().product.findUnique({
    where: { id: productId },
    select: { status: true, organizationId: true },
  });
  if (!product) return status(["not_verified"]);
  const vendor = await vendorListing(product.organizationId, service);
  const reasons: ListingReason[] = [];
  if (vendor.reasons.includes("module_off")) reasons.push("module_off");
  if (product.status !== "verified") reasons.push("not_verified");
  if (vendor.reasons.some((r) => r !== "module_off")) reasons.push("vendor_not_listed");
  return status(reasons);
}

export async function nutritionistListing(
  userId: string,
  service: EntitlementService = getEntitlementService(),
): Promise<ListingStatus> {
  const [on, profile, entitlements] = await Promise.all([
    service.isEnabled("nutritionists"),
    getPrisma().nutritionistProfile.findUnique({
      where: { userId },
      select: { status: true, user: { select: { status: true } } },
    }),
    service.entitlementsFor({ userId }),
  ]);
  const reasons: ListingReason[] = [];
  if (!on) reasons.push("module_off");
  if (profile?.status !== "verified") reasons.push("not_verified");
  if (profile && profile.user.status !== "active") reasons.push("account_suspended");
  if (!entitlements["nutritionist.listing"]) reasons.push("no_listing_plan");
  return status(reasons);
}
