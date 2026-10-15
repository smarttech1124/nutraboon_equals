import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { DAY_LABELS, parseAvailability } from "@/lib/nutritionists/availability";
import { requireNutritionist } from "@/lib/nutritionists/server";
import { saveAvailabilityAction } from "../../actions";

export const metadata: Metadata = { title: "Availability — Nutritionist portal" };

const INPUT = "min-h-10 rounded-lg border border-line bg-surface px-2 text-ink";

/** Weekly availability in Lagos time (ADR-064). Clients can only request times inside it. */
export default async function AvailabilityPage() {
  const { user } = await requireNutritionist("/nutritionist/availability");
  const p = await getPrisma().nutritionistProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: { availability: true },
  });
  const windows = parseAvailability(p.availability);

  return (
    <Card
      title="Weekly availability"
      description="Times are in Nigerian time (WAT). Leave a day blank if you are not available. Clients can only request sessions inside these hours."
    >
      <ActionForm action={saveAvailabilityAction} submitLabel="Save availability">
        <div className="flex flex-col gap-3">
          {DAY_LABELS.map((day, i) => {
            const w = windows.find((x) => x.day === i);
            return (
              <fieldset key={day} className="flex flex-wrap items-center gap-3">
                <legend className="w-28 text-sm font-medium text-ink">{day}</legend>
                <label className="flex items-center gap-2 text-sm text-ink">
                  From
                  <input
                    type="time"
                    name={`avail:${i}:start`}
                    defaultValue={w?.start ?? ""}
                    className={INPUT}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  to
                  <input
                    type="time"
                    name={`avail:${i}:end`}
                    defaultValue={w?.end ?? ""}
                    className={INPUT}
                  />
                </label>
              </fieldset>
            );
          })}
        </div>
      </ActionForm>
    </Card>
  );
}
