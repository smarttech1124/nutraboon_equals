import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";
import Link from "next/link";
import { connection } from "next/server";
import { LocateButton } from "@/components/hospitals/locate-button";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { canonicalState, STATES } from "@/lib/budget/regions";
import { inNigeria, RADII } from "@/lib/geo/distance";
import { geocode } from "@/lib/geo/nominatim";
import {
  ACCESS_SERVICE_KEYS,
  ACCESS_SERVICES,
  isAccessService,
} from "@/lib/hospitals/accessibility";
import { findHospitals } from "@/lib/hospitals/directory";

export const metadata: Metadata = { title: "Find a hospital" };

const SELECT = "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink";

type Params = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function list(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
}

/** The same search with one parameter changed, for "search wider" links. */
function hrefWith(params: Params, changes: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of list(v)) q.append(k, x);
  for (const [k, v] of Object.entries(changes)) q.set(k, v);
  return `/hospitals?${q.toString()}`;
}

/**
 * Hospitals near a place, by distance (ADR-068). A typed place is looked up
 * on OpenStreetMap; "use my location" uses this device's position with the
 * browser's permission and is not stored.
 */
export default async function HospitalsPage({ searchParams }: PageProps<"/hospitals">) {
  // Per request: the feature flag and listings change without a deploy.
  await connection();
  const service = getEntitlementService();
  if (!(await service.isEnabled("hospitals"))) {
    return (
      <ComingSoon
        icon="hospital"
        title="Find an accessible hospital"
        text="We are verifying our first partner hospitals. Soon you can find one near you, book appointments, and message staff by text or voice. In an emergency, call 112."
        partnerHref="/hospital/join"
        partnerLabel="Register your hospital"
      />
    );
  }
  const params = (await searchParams) as Params;

  const placeText = str(params.place).slice(0, 120);
  const lat = Number(str(params.latitude));
  const lng = Number(str(params.longitude));
  const device =
    str(params.latitude) && Number.isFinite(lat) && Number.isFinite(lng)
      ? { latitude: lat, longitude: lng }
      : null;
  let near: { latitude: number; longitude: number } | null = null;
  let nearLabel = "";
  let placeError = "";
  if (device) {
    if (inNigeria(device)) {
      near = device;
      nearLabel = "your location";
    } else {
      placeError = "Your location seems to be outside Nigeria. Type a place instead.";
    }
  } else if (placeText) {
    const place = await geocode(placeText);
    if (place) {
      near = place;
      nearLabel = placeText;
    } else {
      placeError = `We could not find “${placeText}” in Nigeria. Try a nearby town or area, or choose a state.`;
    }
  }

  const radiusParam = str(params.radius);
  const radiusKm =
    radiusParam === "any"
      ? null
      : RADII.includes(Number(radiusParam) as (typeof RADII)[number])
        ? Number(radiusParam)
        : await service.hospitalRadiusKm();
  const state = canonicalState(str(params.state)) ?? null;
  const department = str(params.department).slice(0, 60);
  const access = list(params.access).filter(isAccessService);

  const cards = await findHospitals({ near, radiusKm, state, department, access });
  const wider = near && radiusKm ? RADII.find((r) => r > radiusKm) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Find a hospital</h1>
        <p className="mt-1 text-muted">
          Verified hospitals that you can reach by text or voice through Nutraboom Equals. Book an
          appointment and tell them what you need before you arrive.
        </p>
      </div>
      <Alert tone="warning">
        In an emergency, call 112 or go to the nearest emergency department now.
      </Alert>
      <Card>
        <div className="flex flex-col gap-4">
          <form
            id="hospital-search"
            className="flex flex-col gap-4"
            role="search"
            aria-label="Search for hospitals"
          >
            <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink sm:col-span-2">
                Near (town, area or street)
                <input
                  name="place"
                  defaultValue={device ? "" : placeText}
                  placeholder="e.g. Iyana-Ipaja, Lagos"
                  maxLength={120}
                  className={SELECT}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                Distance
                <select
                  name="radius"
                  defaultValue={radiusKm === null ? "any" : String(radiusKm)}
                  className={SELECT}
                >
                  {RADII.map((r) => (
                    <option key={r} value={r}>
                      Within {r} km
                    </option>
                  ))}
                  <option value="any">Any distance</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                Or state (when no place is given)
                <select name="state" defaultValue={state ?? ""} className={SELECT}>
                  <option value="">Anywhere</option>
                  {[...STATES].sort().map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                Department or service
                <input
                  name="department"
                  defaultValue={department}
                  placeholder="e.g. Antenatal"
                  maxLength={60}
                  className={SELECT}
                />
              </label>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink">Must offer</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACCESS_SERVICE_KEYS.map((k) => (
                  <label key={k} className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="access"
                      value={k}
                      defaultChecked={access.includes(k)}
                      className="mt-1 size-4"
                    />
                    {ACCESS_SERVICES[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button
                type="submit"
                className="min-h-10 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
              >
                Search
              </button>
            </div>
          </form>
          <form id="near-me" className="hidden" aria-hidden="true">
            <input type="hidden" name="latitude" />
            <input type="hidden" name="longitude" />
            <input type="hidden" name="radius" value={radiusKm === null ? "any" : radiusKm} />
          </form>
          <LocateButton label="Use my location" formId="near-me" />
          <p className="text-xs text-muted">
            Place search © OpenStreetMap contributors. Your location is used for this search only
            and is not saved.
          </p>
        </div>
      </Card>

      {placeError && <Alert tone="warning">{placeError}</Alert>}

      <section aria-label="Hospitals" className="flex flex-col gap-3">
        {near && (
          <p className="text-sm text-muted">
            {cards.length} {cards.length === 1 ? "hospital" : "hospitals"}{" "}
            {radiusKm ? `within ${radiusKm} km of ${nearLabel}` : `by distance from ${nearLabel}`}
          </p>
        )}
        {cards.length === 0 ? (
          <Card>
            <EmptyState title="No hospitals found here yet">
              {wider ? (
                <Link
                  href={hrefWith(params, { radius: String(wider) })}
                  className="font-semibold text-brand-text underline"
                >
                  Search within {wider} km
                </Link>
              ) : near && radiusKm ? (
                <Link
                  href={hrefWith(params, { radius: "any" })}
                  className="font-semibold text-brand-text underline"
                >
                  Search at any distance
                </Link>
              ) : (
                "Try another place or state, or fewer requirements."
              )}
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((h) => (
              <li key={h.id}>
                <Card title={h.name}>
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="text-ink">
                      {[h.area, h.city, h.state].filter(Boolean).join(", ")}
                      {h.distanceKm !== null && (
                        <span className="text-muted"> · about {h.distanceKm} km away</span>
                      )}
                    </p>
                    {h.departments.length > 0 && (
                      <p className="text-muted">{h.departments.slice(0, 6).join(", ")}</p>
                    )}
                    <ul className="flex flex-wrap gap-1.5" aria-label="Accessibility">
                      {h.accessibility.filter(isAccessService).map((a) => (
                        <li key={a}>
                          <Badge tone="info">{ACCESS_SERVICES[a]}</Badge>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/hospitals/${h.id}`}
                      className="font-semibold text-brand-text underline"
                    >
                      View, book or message<span className="sr-only"> {h.name}</span>
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
