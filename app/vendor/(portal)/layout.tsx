import { Badge } from "@/components/ui";
import { SectionNav } from "@/components/ui/section-nav";
import { REVIEW_STATUS_LABEL } from "@/lib/vendors/categories";
import { requireVendor } from "@/lib/vendors/server";

const SECTIONS = [
  { href: "/vendor", label: "Dashboard" },
  { href: "/vendor/business", label: "Business" },
  { href: "/vendor/products", label: "Products" },
  { href: "/vendor/plan", label: "Plan" },
];

/** The vendor portal (ADR-067): the business owner only. */
export default async function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  const { org, status } = await requireVendor("/vendor");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Vendor portal</p>
          <p className="text-lg font-semibold text-ink">{org.name}</p>
        </div>
        <Badge
          tone={status === "verified" ? "success" : status === "submitted" ? "info" : "warning"}
        >
          {REVIEW_STATUS_LABEL[status] ?? status}
        </Badge>
      </div>
      <SectionNav items={SECTIONS} label="Vendor portal" root="/vendor" />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
