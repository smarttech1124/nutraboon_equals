import type { MealPlan } from "@/lib/meals/plan";

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

/**
 * Renders a validated meal plan inside the outcome card, with each meal's
 * app-calculated purchase cost when known. Text only, so model output cannot
 * inject markup.
 */
export function MealPlanCard({
  plan,
  mealCosts,
}: {
  plan: MealPlan;
  /** Keyed "dayIndex:mealIndex" (ADR-051). */
  mealCosts?: Record<string, number>;
}) {
  return (
    <section aria-label="Meal plan">
      {plan.days.map((day, d) => (
        <div key={day.day} className="not-first:mt-3">
          {plan.days.length > 1 && <h4 className="font-semibold text-brand-text">{day.day}</h4>}
          {plan.days.length === 1 && <h4 className="sr-only">{day.day}</h4>}
          <ul className="mt-1 space-y-3">
            {day.meals.map((meal, i) => {
              const cost = mealCosts?.[`${d}:${i}`];
              return (
                <li key={`${meal.mealType}-${i}`}>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {MEAL_LABEL[meal.mealType]}
                    {meal.packed && (
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 tracking-normal text-brand-text normal-case">
                        Lunchbox
                      </span>
                    )}
                  </p>
                  <p className="font-medium">{meal.name}</p>
                  <p className="text-muted">{meal.foods.join(", ")}</p>
                  {meal.portionNote && <p className="text-muted italic">{meal.portionNote}</p>}
                  {meal.why && (
                    <p className="mt-0.5">
                      <span className="font-medium">Why: </span>
                      {meal.why}
                    </p>
                  )}
                  {cost !== undefined && (
                    <p className="text-brand-text">Estimated cost to buy: about {naira(cost)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {plan.notes && plan.notes.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 border-t border-line pt-2 pl-4 text-muted">
          {plan.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        Nutritional needs vary from person to person. This plan is general guidance, not medical
        advice.
      </p>
    </section>
  );
}
