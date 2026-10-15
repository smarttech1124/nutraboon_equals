import Link from "next/link";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { ownedVendorOrgId } from "@/lib/vendors/ownership";

/** Entry to the vendor portal from the account page, when Vendors is on (ADR-067). */
export async function VendorLink({ user }: { user: AuthUser }) {
  if (!(await getEntitlementService().isEnabled("vendors"))) return null;
  const owns = await ownedVendorOrgId(user.id);
  return (
    <p className="text-sm text-muted">
      {owns ? (
        <Link href="/vendor" className="font-semibold text-brand-text underline">
          Open your vendor portal
        </Link>
      ) : (
        <>
          Do you sell food products?{" "}
          <Link href="/vendor/join" className="font-semibold text-brand-text underline">
            Become a vendor
          </Link>
        </>
      )}
    </p>
  );
}
