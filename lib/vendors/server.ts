import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/next";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { ownerOf } from "./ownership";

/** Server helpers for the vendor portal (ADR-067). One business per account for now. */

export type VendorAccess = {
  user: AuthUser;
  org: { id: string; name: string };
  status: string;
};

async function findVendor(userId: string) {
  return getPrisma().organization.findFirst({
    where: { kind: "vendor", ...ownerOf(userId) },
    select: { id: true, name: true, vendor: { select: { status: true } } },
  });
}

/** For portal pages: signed in, Vendors switched on, and a business started. */
export async function requireVendor(path: string): Promise<VendorAccess> {
  const user = await currentUser("web");
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  if (!(await getEntitlementService().isEnabled("vendors"))) redirect("/account");
  const org = await findVendor(user.id);
  if (!org?.vendor) redirect("/vendor/join");
  return { user, org: { id: org.id, name: org.name }, status: org.vendor.status };
}

export type VendorActionState = { status: "idle" | "success" | "error"; message: string };

export const VENDOR_FAILED: VendorActionState = {
  status: "error",
  message: "Something went wrong. Nothing was changed; please try again.",
};

/** Runs a portal action for the signed-in vendor owner, mapping failures to safe messages. */
export async function asVendor(
  action: string,
  run: (access: VendorAccess) => Promise<VendorActionState>,
): Promise<VendorActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  try {
    if (!(await getEntitlementService().isEnabled("vendors"))) {
      return { status: "error", message: "The vendor portal is not available right now." };
    }
    const org = await findVendor(user.id);
    if (!org?.vendor) return { status: "error", message: "Set up your business first." };
    if (org.vendor.status === "suspended" || org.vendor.status === "rejected") {
      return { status: "error", message: "Your business cannot be changed at the moment." };
    }
    return await run({ user, org: { id: org.id, name: org.name }, status: org.vendor.status });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "vendor_action_error",
        action,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return VENDOR_FAILED;
  }
}

/** Organization.status mirrors the vendor review (pending until verified). */
export function orgStatusFor(review: string): "pending" | "verified" | "rejected" | "suspended" {
  return review === "verified" || review === "rejected" || review === "suspended"
    ? review
    : "pending";
}

/** A verified item goes back to review when what was verified changes. */
export function backToReview(status: string) {
  return status === "verified" ? { status: "submitted" as const, submittedAt: new Date() } : {};
}
