import {
  lagosClock,
  parseAvailability,
  type AvailabilityWindow,
} from "@/lib/nutritionists/availability";

/**
 * Bookable appointment slots (ADR-068), computed by code from a department's
 * weekly availability (Lagos time), its slot length and capacity, and the
 * appointments already booked. Times are UTC instants.
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
export const MAX_DAYS_AHEAD = 60;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Midnight in Lagos for the Lagos date of `instant`, as a UTC instant. */
export function lagosMidnight(instant: Date): Date {
  const lagos = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  return new Date(
    Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - LAGOS_OFFSET_MS,
  );
}

/** "YYYY-MM-DD" of a Lagos date, and back. */
export function lagosDateKey(instant: Date): string {
  return new Date(instant.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function fromLagosDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || lagosDateKey(new Date(d.getTime() - LAGOS_OFFSET_MS)) !== key
    ? null
    : new Date(d.getTime() - LAGOS_OFFSET_MS);
}

/** Every slot start on one Lagos date that is open and not full. */
export function slotsForDay(
  date: Date,
  windows: AvailabilityWindow[] | unknown,
  slotMinutes: number,
  capacity: number,
  booked: Date[],
  now: Date,
): Date[] {
  const parsed = Array.isArray(windows) ? parseAvailability(windows) : [];
  const midnight = lagosMidnight(date);
  const { day } = lagosClock(new Date(midnight.getTime() + 12 * 60 * 60 * 1000));
  if (midnight.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) return [];
  const counts = new Map<number, number>();
  for (const b of booked) counts.set(b.getTime(), (counts.get(b.getTime()) ?? 0) + 1);
  const out: Date[] = [];
  for (const w of parsed.filter((x) => x.day === day)) {
    for (let m = minutesOf(w.start); m + slotMinutes <= minutesOf(w.end); m += slotMinutes) {
      const start = new Date(midnight.getTime() + m * 60_000);
      if (start.getTime() < now.getTime() + MIN_NOTICE_MS) continue;
      if ((counts.get(start.getTime()) ?? 0) >= capacity) continue;
      out.push(start);
    }
  }
  return out;
}

/** The next dates (Lagos) that have any availability window at all. */
export function openDates(windows: unknown, now: Date, count = 14): string[] {
  const parsed = Array.isArray(windows) ? parseAvailability(windows) : [];
  const days = new Set(parsed.map((w) => w.day));
  const out: string[] = [];
  for (let i = 0; i < MAX_DAYS_AHEAD && out.length < count; i++) {
    const date = new Date(lagosMidnight(now).getTime() + i * DAY_MS + 12 * 60 * 60 * 1000);
    if (days.has(lagosClock(date).day)) out.push(lagosDateKey(date));
  }
  return out;
}
