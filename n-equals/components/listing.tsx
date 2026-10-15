import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Card } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { LISTING_REASON_TEXT, type ListingStatus } from "@/lib/directory/visibility";
import { grantListingAction } from "../app/(portal)/listing/actions";

/**
 * Whether this partner is on the public site, and what is missing if not
 * (ADR-082), with the fixes an administrator can make from here.
 */
export function ListingCard({
  status,
  kind,
  holderId,
  publicHref,
  canGrant,
  canSettings,
}: {
  status: ListingStatus;
  kind: "hospital" | "vendor" | "nutritionist";
  holderId: string;
  publicHref: string;
  canGrant: boolean;
  canSettings: boolean;
}) {
  const site = process.env.APP_URL?.replace(/\/$/, "");
  return (
    <Card
      title="Public listing"
      actions={
        <Badge tone={status.listed ? "success" : "warning"}>
          {status.listed ? "Shown on the website" : "Not shown"}
        </Badge>
      }
    >
      {status.listed ? (
        <p className="text-sm text-ink">
          Visitors can find this {kind} in the public directory
          {site && (
            <>
              {" "}
              (
              <a href={`${site}${publicHref}`} className="text-brand-text underline">
                open it
              </a>
              )
            </>
          )}
          .
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink">It is not on the public site because:</p>
          <ul className="list-disc pl-5 text-ink">
            {status.reasons.map((r) => (
              <li key={r}>{LISTING_REASON_TEXT[r]}</li>
            ))}
          </ul>
          {status.reasons.includes("module_off") && canSettings && (
            <p>
              <Link href="/settings" className="text-brand-text underline">
                Switch the module on in Settings
              </Link>
            </p>
          )}
          {status.reasons.includes("no_listing_plan") && canGrant && (
            <ActionForm
              action={grantListingAction}
              submitLabel="Grant listing for a year"
              pendingLabel="Granting…"
              variant="secondary"
              confirm="Grant this partner a year of listing, free of charge?"
              className="flex flex-col gap-2"
            >
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="holderId" value={holderId} />
            </ActionForm>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Shown above a review queue when its module is off (ADR-082): verifying
 * works, but nothing appears on the website until the module is switched on.
 */
export async function ModuleOffNotice({
  flag,
  label,
}: {
  flag: "hospitals" | "vendors" | "nutritionists";
  label: string;
}) {
  if (await getEntitlementService().isEnabled(flag)) return null;
  return (
    <Alert tone="warning">
      The {label} module is switched off, so the public {label} page shows “Coming soon” and
      verified {label} are not shown. Switch it on under{" "}
      <Link href="/settings" className="font-semibold underline">
        Settings
      </Link>
      .
    </Alert>
  );
}
