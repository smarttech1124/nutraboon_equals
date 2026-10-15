import type { BudgetSummary } from "@/lib/budget/summary";

const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

/**
 * A shopping list priced by the app, shown inside the outcome card. Every
 * figure is labelled as an estimate (ADR-007).
 */
export function BudgetCard({ budget }: { budget: BudgetSummary }) {
  const over = budget.estimatedRemaining !== undefined && budget.estimatedRemaining < 0;

  return (
    <section aria-label="Budget estimate" className="border-t border-line pt-3">
      {budget.budget !== undefined && (
        <p className="font-semibold">Budget: {naira(budget.budget)}</p>
      )}

      {budget.fromHome.length > 0 && (
        <div className="mt-2">
          <h4 className="font-semibold text-brand-text">Already at home</h4>
          <p className="text-muted">{budget.fromHome.join(", ")}</p>
        </div>
      )}

      {budget.purchases.length > 0 && (
        <div className="mt-2">
          <h4 className="font-semibold text-brand-text">Shopping list (estimated prices)</h4>
          <ul className="mt-1 space-y-1">
            {budget.purchases.map((p) => (
              <li key={p.name} className="flex justify-between gap-3">
                <span>
                  {p.name}{" "}
                  <span className="text-muted">
                    × {p.quantity} ({p.unitLabel})
                  </span>
                </span>
                <span className="shrink-0">about {naira(p.estimatedCost)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {budget.unpriced.length > 0 && (
        <p className="mt-2 text-muted">No price estimate yet for: {budget.unpriced.join(", ")}.</p>
      )}

      <h4 className="mt-3 font-semibold text-brand-text">Budget summary</h4>
      <dl className="mt-1">
        <div className="flex justify-between">
          <dt>Estimated total</dt>
          <dd className="font-semibold">{naira(budget.estimatedTotal)}</dd>
        </div>
        {budget.estimatedRemaining !== undefined && (
          <div className="flex justify-between">
            <dt>{over ? "Estimated over budget" : "Estimated remaining"}</dt>
            <dd className={`font-semibold ${over ? "text-danger" : ""}`}>
              {naira(Math.abs(budget.estimatedRemaining))}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-xs text-muted">
        Estimated prices from the{" "}
        <a
          href={budget.priceSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-text underline underline-offset-2"
        >
          {budget.priceSource}
        </a>{" "}
        ({budget.regionLabel}). Not current market prices; what you pay will vary.
        {budget.unpriced.length > 0 && " The total leaves out items without an estimate."}
      </p>
    </section>
  );
}
