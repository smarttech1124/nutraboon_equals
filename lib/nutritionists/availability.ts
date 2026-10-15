import { z } from "zod";

/**
 * Weekly availability in Lagos time (ADR-064). Nigeria has no daylight
 * saving: West Africa Time is always UTC+1.
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const windowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(TIME),
    end: z.string().regex(TIME),
  })
  .refine((w) => w.start < w.end, "A window must end after it starts.");

export type AvailabilityWindow = z.infer<typeof windowSchema>;

/** Stored JSON is not trusted: invalid windows are dropped. At most 21 windows. */
export function parseAvailability(value: unknown): AvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((w) => {
      const parsed = windowSchema.safeParse(w);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 21)
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Day of week and minutes after midnight in Lagos for a UTC instant. */
export function lagosClock(instant: Date): { day: number; minutes: number } {
  const lagos = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  return { day: lagos.getUTCDay(), minutes: lagos.getUTCHours() * 60 + lagos.getUTCMinutes() };
}

/** Converts a "YYYY-MM-DDTHH:mm" value typed in Lagos time to a UTC instant. */
export function fromLagosLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - LAGOS_OFFSET_MS;
  const date = new Date(utc);
  // Reject impossible dates such as 31 February, which Date.UTC rolls over.
  const check = new Date(utc + LAGOS_OFFSET_MS);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return date;
}

/** True when the whole session fits inside one availability window. */
export function fitsAvailability(
  windows: AvailabilityWindow[],
  startsAt: Date,
  minutes: number,
): boolean {
  const { day, minutes: start } = lagosClock(startsAt);
  const end = start + minutes;
  return windows.some(
    (w) => w.day === day && minutesOf(w.start) <= start && end <= minutesOf(w.end),
  );
}

/** Reads windows from a form: "avail:<day>:start" and "avail:<day>:end", one window per day. */
export function availabilityFromForm(
  formData: FormData,
): { ok: true; value: AvailabilityWindow[] } | { ok: false; error: string } {
  const out: AvailabilityWindow[] = [];
  for (let day = 0; day < 7; day++) {
    const start = formData.get(`avail:${day}:start`);
    const end = formData.get(`avail:${day}:end`);
    if (!start && !end) continue;
    if (typeof start !== "string" || typeof end !== "string" || !start || !end) {
      return { ok: false, error: `Give both a start and an end time for ${DAY_LABELS[day]}.` };
    }
    const parsed = windowSchema.safeParse({ day, start, end });
    if (!parsed.success) {
      return { ok: false, error: `${DAY_LABELS[day]}: the end time must be after the start time.` };
    }
    out.push(parsed.data);
  }
  return { ok: true, value: out };
}

export function describeAvailability(windows: AvailabilityWindow[]): string[] {
  return windows.map((w) => `${DAY_LABELS[w.day]} ${w.start}–${w.end}`);
}
