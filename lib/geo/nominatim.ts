import { getPrisma } from "@/lib/db";
import { normalizeText } from "@/lib/nutrition/match";
import { inNigeria } from "./distance";

/**
 * Geocoding with OpenStreetMap Nominatim (ADR-068), for typed places such as
 * "Iyana-Ipaja" and hospital addresses. The public service's usage policy
 * applies: an identifying User-Agent, at most one request per second, and
 * results cached (GeocodeCache) so each place is looked up once. Results
 * outside Nigeria are ignored. Pages using it credit OpenStreetMap.
 *
 * NOMINATIM_URL can point at a self-hosted Nominatim instead.
 */

export type Place = { latitude: number; longitude: number; label: string };

const DEFAULT_URL = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 8_000;
/** Cached misses are retried after a week; places do not move. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const shared = globalThis as unknown as { nominatimNext?: number };

/** Waits so requests from this server are at least a second apart. */
async function throttle(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, shared.nominatimNext ?? 0);
  shared.nominatimNext = at + 1100;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export function geocodeKey(query: string): string {
  return normalizeText(query).slice(0, 200);
}

export type GeocodeFetch = typeof fetch;

/** Looks a place up, from the cache when possible. Null when not found or unavailable. */
export async function geocode(
  query: string,
  fetchImpl: GeocodeFetch = fetch,
): Promise<Place | null> {
  const key = geocodeKey(query);
  if (key.length < 2) return null;
  const prisma = getPrisma();
  const cached = await prisma.geocodeCache.findUnique({ where: { query: key } });
  if (cached) {
    if (cached.latitude !== null && cached.longitude !== null) {
      return {
        latitude: cached.latitude,
        longitude: cached.longitude,
        label: cached.label ?? query,
      };
    }
    if (Date.now() - cached.createdAt.getTime() < MISS_TTL_MS) return null;
  }
  const place = await lookup(query, fetchImpl);
  if (place === undefined) return null; // service unavailable: do not cache
  await prisma.geocodeCache.upsert({
    where: { query: key },
    create: {
      query: key,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      label: place?.label ?? null,
    },
    update: {
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      label: place?.label ?? null,
      createdAt: new Date(),
    },
  });
  return place;
}

/** null: not found in Nigeria; undefined: the service could not be reached. */
export async function lookup(
  query: string,
  fetchImpl: GeocodeFetch = fetch,
): Promise<Place | null | undefined> {
  const base = (process.env.NOMINATIM_URL || DEFAULT_URL).replace(/\/$/, "");
  const params = new URLSearchParams({
    q: query.slice(0, 200),
    format: "jsonv2",
    countrycodes: "ng",
    limit: "1",
    addressdetails: "0",
  });
  await throttle();
  let response: Response;
  try {
    response = await fetchImpl(`${base}/search?${params}`, {
      headers: {
        "User-Agent": `NutraboomEquals/1.0 (${process.env.PRIVACY_CONTACT_EMAIL || "contact via app"})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  const body = (await response.json().catch(() => null)) as
    { lat?: string; lon?: string; display_name?: string }[] | null;
  const first = Array.isArray(body) ? body[0] : undefined;
  if (!first?.lat || !first.lon) return null;
  const place = {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    label: (first.display_name ?? query).split(",").slice(0, 3).join(",").trim(),
  };
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || !inNigeria(place)) {
    return null;
  }
  return place;
}
