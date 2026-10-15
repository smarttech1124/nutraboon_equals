import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { EntitlementFields } from "@admin/components/entitlement-fields";
import { NotAllowed, PageHeader } from "@admin/components/shell";
import { adminAccess } from "@admin/lib/access";
import { Card, Field } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { freeDefaults } from "@/lib/billing/entitlements";
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  MAX_GRACE_DAYS,
  MAX_RADIUS_KM,
} from "@/lib/billing/settings";
import { configuredProviders } from "@/lib/payments";
import { PROVIDER_LABEL } from "@/lib/payments/types";
import {
  saveFeaturesAction,
  saveFreeTierAction,
  saveGraceDaysAction,
  saveHospitalRadiusAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

/** Feature flags, the free tier and billing settings (ADR-062). */
export default async function SettingsPage() {
  const access = await adminAccess("settings.manage");
  if (!access.ok) return <NotAllowed />;
  const service = getEntitlementService();
  const [flags, free, graceDays, radiusKm] = await Promise.all([
    service.featureFlags(),
    service.freeTier(),
    service.graceDays(),
    service.hospitalRadiusKm(),
  ]);
  const providers = configuredProviders();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Changes apply at once, without a deploy." />
      <Card
        title="Features"
        description="Switch modules on when they are ready. Off hides them from users."
      >
        <ActionForm action={saveFeaturesAction} submitLabel="Save features">
          <div className="flex flex-col gap-3">
            {FEATURE_FLAG_KEYS.map((key) => (
              <label
                key={key}
                htmlFor={`flag-${key}`}
                className="flex items-start gap-2 text-sm text-ink"
              >
                <input
                  id={`flag-${key}`}
                  name={key}
                  type="checkbox"
                  defaultChecked={flags[key]}
                  className="mt-1"
                />
                <span>
                  {FEATURE_FLAGS[key].label}
                  <span className="block text-muted">{FEATURE_FLAGS[key].description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-sm text-muted">
            Payment providers configured on the server:{" "}
            {providers.length > 0 ? providers.map((p) => PROVIDER_LABEL[p]).join(", ") : "none"}.
          </p>
        </ActionForm>
      </Card>
      <Card
        title="Free tier"
        description="What everyone gets without a plan. Blank fields use the built-in default shown."
      >
        <ActionForm action={saveFreeTierAction} submitLabel="Save free tier">
          <EntitlementFields idPrefix="free" values={free} placeholders={freeDefaults()} />
        </ActionForm>
      </Card>
      <Card
        title="Billing"
        description="How long a subscriber keeps their plan after a renewal payment fails."
      >
        <ActionForm action={saveGraceDaysAction} submitLabel="Save">
          <Field
            id="graceDays"
            name="graceDays"
            type="number"
            min={0}
            max={MAX_GRACE_DAYS}
            defaultValue={String(graceDays)}
            label="Grace period (days)"
            required
          />
        </ActionForm>
      </Card>
      <Card
        title="Hospital search"
        description="How far from a patient's place the hospital directory looks at first. Patients can widen it."
      >
        <ActionForm action={saveHospitalRadiusAction} submitLabel="Save">
          <Field
            id="radiusKm"
            name="radiusKm"
            type="number"
            min={1}
            max={MAX_RADIUS_KM}
            defaultValue={String(radiusKm)}
            label="Default distance (km)"
            required
          />
        </ActionForm>
      </Card>
    </div>
  );
}
