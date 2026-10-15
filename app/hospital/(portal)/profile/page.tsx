import type { Metadata } from "next";
import { LocateButton } from "@/components/hospitals/locate-button";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CheckboxGroup, Field, SelectField, TextAreaField } from "@/components/ui";
import { STATES } from "@/lib/budget/regions";
import { getPrisma } from "@/lib/db";
import { ACCESS_SERVICES, ACCESS_SERVICE_KEYS } from "@/lib/hospitals/accessibility";
import { requireHospital } from "@/lib/hospitals/server";
import { saveHospitalProfileAction, setLocationAction } from "../../actions";

export const metadata: Metadata = { title: "Hospital details — Hospital portal" };

/** Hospital details, accessibility services and map location (ADR-068). */
export default async function HospitalProfilePage() {
  const { org, status } = await requireHospital("/hospital/profile", true);
  const p = await getPrisma().hospitalProfile.findUniqueOrThrow({
    where: { organizationId: org.id },
  });
  const pinned = p.latitude !== null && p.longitude !== null;

  return (
    <>
      <Card
        title="Hospital details"
        description={
          status === "verified"
            ? "Changing the name, address or registration sends the hospital back for review."
            : "Shown to patients once verified."
        }
      >
        {status === "submitted" ? (
          <p className="text-sm text-muted">
            Your hospital is being reviewed. You can edit it afterwards.
          </p>
        ) : (
          <ActionForm action={saveHospitalProfileAction} submitLabel="Save details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="name"
                name="name"
                label="Name"
                defaultValue={org.name}
                required
                maxLength={120}
              />
              <Field
                id="registrationNumber"
                name="registrationNumber"
                label="Facility registration number"
                defaultValue={p.registrationNumber ?? ""}
              />
            </div>
            <TextAreaField
              id="description"
              name="description"
              label="About the hospital"
              maxLength={1500}
              defaultValue={p.description}
            />
            <Field
              id="address"
              name="address"
              label="Street address"
              defaultValue={p.address}
              required
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="area" name="area" label="Area (e.g. Iyana-Ipaja)" defaultValue={p.area} />
              <Field id="city" name="city" label="City or town" defaultValue={p.city} />
              <SelectField
                id="state"
                name="state"
                label="State"
                defaultValue={p.state ?? ""}
                required
              >
                <option value="" disabled>
                  Choose the state
                </option>
                {[...STATES].sort().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="phone"
                name="phone"
                type="tel"
                label="Phone"
                defaultValue={p.phone ?? ""}
              />
              <Field
                id="emergencyPhone"
                name="emergencyPhone"
                type="tel"
                label="Emergency line"
                defaultValue={p.emergencyPhone ?? ""}
              />
              <Field
                id="email"
                name="email"
                type="email"
                label="Email"
                defaultValue={p.email ?? ""}
              />
              <Field
                id="website"
                name="website"
                type="url"
                label="Website"
                defaultValue={p.website ?? ""}
              />
            </div>
            <CheckboxGroup
              legend="Accessibility services you offer"
              name="accessibility"
              options={ACCESS_SERVICE_KEYS.map((k) => ({ value: k, label: ACCESS_SERVICES[k] }))}
              selected={p.accessibility}
            />
          </ActionForm>
        )}
      </Card>

      <Card
        title="Location on the map"
        description={
          pinned
            ? `Pinned at ${p.latitude!.toFixed(5)}, ${p.longitude!.toFixed(5)}. Patients searching nearby will find you.`
            : "Not pinned yet. Patients searching by distance cannot find you until you pin the hospital."
        }
      >
        <div className="flex flex-col gap-4">
          {pinned && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-brand-text underline"
            >
              Check the pin on OpenStreetMap<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <ActionForm
            action={setLocationAction}
            submitLabel="Find from the address"
            pendingLabel="Searching…"
            variant="secondary"
          >
            <input type="hidden" name="mode" value="address" />
            <p className="text-sm text-muted">Uses the address above. Save the details first.</p>
          </ActionForm>
          <form
            id="locate-hospital"
            action={async (fd) => {
              "use server";
              await setLocationAction({ status: "idle", message: "" }, fd);
            }}
          >
            <input type="hidden" name="mode" value="device" />
            <input type="hidden" name="latitude" />
            <input type="hidden" name="longitude" />
          </form>
          <LocateButton
            label="Use this device's location (when at the hospital)"
            formId="locate-hospital"
          />
          <p className="text-xs text-muted">Map search © OpenStreetMap contributors.</p>
        </div>
      </Card>
    </>
  );
}
