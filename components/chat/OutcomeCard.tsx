import type { BudgetSummary } from "@/lib/budget/summary";
import type { MealPlan } from "@/lib/meals/plan";
import type { Outcome } from "@/lib/outcome/build";
import { BudgetCard } from "./BudgetCard";
import { MealPlanCard } from "./MealPlanCard";

const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

/**
 * The structured result at the top of a reply (ADR-051). Built from
 * app-calculated data; the model's text follows it for context and
 * follow-up. Text only, so model output cannot inject markup.
 */
export function OutcomeCard({
  outcome,
  mealPlan,
  budget,
}: {
  outcome?: Outcome;
  mealPlan?: MealPlan;
  budget?: BudgetSummary;
}) {
  const title =
    outcome?.title ?? (mealPlan ? "Your meal plan" : budget ? "Your shopping list" : "Your result");

  return (
    <article
      aria-label={title}
      className="overflow-hidden rounded-2xl border border-line bg-surface text-sm text-ink"
    >
      <header className="border-b border-line bg-brand-soft px-4 py-3">
        <h3 className="text-base font-bold">{title}</h3>
        {outcome?.subtitle && <p className="text-muted">{outcome.subtitle}</p>}
        {budget?.estimatedRemaining !== undefined && (
          <p className="mt-1 font-semibold">
            {budget.estimatedRemaining >= 0
              ? `Estimated total ${naira(budget.estimatedTotal)} • ${naira(budget.estimatedRemaining)} left`
              : `Estimated total ${naira(budget.estimatedTotal)} • ${naira(-budget.estimatedRemaining)} over budget`}
          </p>
        )}
      </header>

      <div className="space-y-4 px-4 py-3">
        {mealPlan && <MealPlanCard plan={mealPlan} mealCosts={outcome?.mealCosts} />}

        {outcome?.foodFacts?.map((food) => (
          <section key={food.name} aria-label={`${food.name} nutrition`}>
            <h4 className="font-semibold text-brand-text">
              {food.name} <span className="font-normal text-muted">· per {food.amount}</span>
            </h4>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {food.nutrients.map((n) => (
                <div key={n.label} className="flex justify-between gap-2">
                  <dt className="text-muted">{n.label}</dt>
                  <dd className="font-medium">
                    {n.value.toLocaleString("en-NG")} {n.unit}
                  </dd>
                </div>
              ))}
            </dl>
            {food.richIn.length > 0 && (
              <p className="mt-1 text-muted">
                Among the richer foods in our data for: {food.richIn.join(", ")}.
              </p>
            )}
          </section>
        ))}
        {outcome?.foodFacts && (
          <p className="text-xs text-muted">Approximate values; they vary by size and variety.</p>
        )}

        {budget && <BudgetCard budget={budget} />}

        {outcome?.nutritionFocus && (
          <section aria-label="Nutrition focus">
            <h4 className="font-semibold text-brand-text">Nutrition focus</h4>
            <ul className="mt-1 space-y-0.5">
              {outcome.nutritionFocus.map((n) => (
                <li key={n.nutrient}>
                  <span className="font-medium">{n.nutrient}</span>
                  <span className="text-muted"> from {n.foods.join(", ")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">
              Foods listed are among the richer ones in our food data for each nutrient.
            </p>
          </section>
        )}
      </div>
    </article>
  );
}
