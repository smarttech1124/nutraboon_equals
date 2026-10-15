import { DAY_LABELS, parseAvailability } from "@/lib/nutritionists/availability";

const INPUT = "min-h-10 rounded-lg border border-line bg-surface px-2 text-ink";

/** One opening window per weekday, in Nigerian time; read by availabilityFromForm. */
export function AvailabilityFields({ value }: { value: unknown }) {
  const windows = parseAvailability(value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">Opening times (Nigerian time)</legend>
      {DAY_LABELS.map((day, i) => {
        const w = windows.find((x) => x.day === i);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 text-sm text-ink">
            <span className="w-24 font-medium" aria-hidden="true">
              {day}
            </span>
            <label className="flex items-center gap-2">
              From
              <input
                type="time"
                name={`avail:${i}:start`}
                defaultValue={w?.start ?? ""}
                aria-label={`${day}: opens at`}
                className={INPUT}
              />
            </label>
            <label className="flex items-center gap-2">
              to
              <input
                type="time"
                name={`avail:${i}:end`}
                defaultValue={w?.end ?? ""}
                aria-label={`${day}: closes at`}
                className={INPUT}
              />
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
