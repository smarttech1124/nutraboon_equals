/** Great-circle distance in kilometres (haversine), for radius search (ADR-068). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough bounds of Nigeria, to reject coordinates that cannot be a Nigerian place. */
export function inNigeria(p: { latitude: number; longitude: number }): boolean {
  return p.latitude >= 4 && p.latitude <= 14 && p.longitude >= 2.6 && p.longitude <= 14.7;
}

/** Search radii offered to users, in km; null means anywhere. */
export const RADII = [5, 10, 25, 50, 100] as const;
