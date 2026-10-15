import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ProductRecommendations } from "@/components/vendors/product-card";
import { recommendProducts } from "@/lib/vendors/directory";
import { countQuietly } from "@/lib/vendors/stats";
import { NutritionistCardView } from "@/components/nutritionists/card";
import { PrintButton } from "@/components/planner/print-button";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Button, Card, Field } from "@/components/ui";
import { formatNaira } from "@/lib/budget/summary";
import { getPrisma } from "@/lib/db";
import { findNutritionists } from "@/lib/nutritionists/directory";
import { isSpecialization, specializationsFor } from "@/lib/nutritionists/specializations";
import { describeFacts, parseFacts, safetyOf } from "@/lib/planner/facts";
import { ingredientNames, showNutrition, type DayNutrition } from "@/lib/planner/nutrition";
import { parseDays } from "@/lib/planner/schema";
import { DAYS_PER_WEEK, requirePlanner, weekCount } from "@/lib/planner/server";
import type { ShoppingList } from "@/lib/planner/shopping";
import { allergenLabel } from "@/lib/safety/allergy";
import { referralNotice, sensitiveCategories } from "@/lib/safety/referrals";
import { adjustWeekAction, deletePlanAction, nextWeekAction, replaceMealAction } from "../actions";

export const metadata: Metadata = { title: "Your meal plan" };
/** Adjusting or adding a week calls the AI several times (ADR-066). */
export const maxDuration = 300;

const dayFormat = new Intl.DateTimeFormat("en-NG", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

export default async function PlanPage({ params, searchParams }: PageProps<"/planner/[id]">) {
  const { id } = await params;
  const { user, entitlements } = await requirePlanner(`/planner/${id}`);
  const plan = await getPrisma().mealPlan.findFirst({
    where: { id, userId: user.id },
    include: { weeks: { orderBy: { weekIndex: "asc" } } },
  });
  if (!plan) notFound();
  const query = await searchParams;
  const totalWeeks = weekCount(plan.durationDays);
  const weekIndex = Math.min(
    Math.max(0, Number(typeof query.week === "string" ? query.week : 1) - 1 || 0),
    Math.max(0, plan.weeks.length - 1),
  );
  const week = plan.weeks.find((w) => w.weekIndex === weekIndex);
  const days = week ? parseDays(week.days) : [];
  const nutrition = (week?.nutrition as DayNutrition[] | null) ?? [];
  const shopping = week?.shopping as ShoppingList | null | undefined;
  const facts = parseFacts(plan.facts);
  const categories = sensitiveCategories(safetyOf(facts));
  const referral = referralNotice(categories);
  const adjustmentsLeft = Math.max(
    0,
    entitlements["mealPlanner.adjustmentsPerWeek"] - (week?.adjustments ?? 0),
  );
  const nutritionists = referral
    ? await findNutritionists(
        {
          state: facts.state ?? null,
          specializations: specializationsFor(
            categories,
            (facts.allergies ?? []).length > 0,
          ).filter(isSpecialization),
        },
        2,
      ).catch(() => [])
    : [];
  // Sponsored products for this week's ingredients, by the same safety rules (ADR-067).
  const safety = safetyOf(facts);
  const products = days.length
    ? await recommendProducts({
        terms: ingredientNames(days),
        allergies: facts.allergies ?? [],
        avoidFoods: facts.avoidFoods,
        infant: safety.infant,
        childUnder5: safety.childUnder5,
        pregnant: safety.pregnant,
        state: facts.state ?? null,
        limit: 3,
      }).catch(() => [])
    : [];
  if (products.length > 0)
    after(() =>
      countQuietly(
        products.map((p) => p.id),
        "impressions",
      ),
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{plan.title}</h1>
          <p className="mt-1 text-muted">
            {plan.durationDays} day{plan.durationDays === 1 ? "" : "s"} ·{" "}
            {describeFacts(facts)
              .filter((l) => l.startsWith("For:"))
              .join("")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
        </div>
      </div>

      {(facts.allergies?.length ?? 0) > 0 && (
        <Alert tone="info">
          Left out because of allergies: {facts.allergies!.map(allergenLabel).join(", ")}. Every
          meal was checked by the app.
        </Alert>
      )}
      {referral && <Alert tone="info">{referral}</Alert>}
      <p className="text-sm text-muted">
        General guidance, not medical advice. Nutrition figures are approximate, calculated from our
        food database where ingredients match; prices are estimates, not current market prices.
      </p>

      {totalWeeks > 1 && (
        <nav aria-label="Weeks" className="flex flex-wrap gap-2 text-sm print:hidden">
          {Array.from({ length: totalWeeks }, (_, i) => i).map((i) =>
            i < plan.weeks.length ? (
              <Link
                key={i}
                href={`/planner/${plan.id}?week=${i + 1}`}
                aria-current={i === weekIndex ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${i === weekIndex ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink hover:bg-subtle"}`}
              >
                Week {i + 1}
              </Link>
            ) : i === plan.weeks.length ? (
              <span
                key={i}
                className="rounded-full border border-dashed border-line px-3 py-1 text-muted"
              >
                Week {i + 1} not written yet
              </span>
            ) : null,
          )}
          {totalWeeks - plan.weeks.length > 1 && (
            <span className="px-1 py-1 text-muted">
              +{totalWeeks - plan.weeks.length - 1} more weeks
            </span>
          )}
        </nav>
      )}

      {days.map((day, dayIndex) => {
        const date = new Date(
          plan.startDate.getTime() + (weekIndex * DAYS_PER_WEEK + dayIndex) * 86_400_000,
        );
        const n = nutrition[dayIndex];
        return (
          <Card
            key={dayIndex}
            title={`Day ${weekIndex * DAYS_PER_WEEK + dayIndex + 1} · ${dayFormat.format(date)}`}
            description={day.goalNote}
          >
            <div className="flex flex-col gap-4">
              {day.meals.map((meal, mealIndex) => (
                <article
                  key={mealIndex}
                  aria-label={`${MEAL_LABEL[meal.mealType]}: ${meal.name}`}
                  className="flex flex-col gap-2 rounded-xl border border-line p-4 text-sm"
                >
                  <p className="text-xs font-semibold tracking-wide text-brand-text uppercase">
                    {MEAL_LABEL[meal.mealType]}
                  </p>
                  <h3 className="text-base font-semibold text-ink">{meal.name}</h3>
                  <p className="text-ink">{meal.why}</p>
                  <p className="text-muted">
                    <span className="font-medium text-ink">Portions: </span>
                    {meal.portion}
                  </p>
                  <details>
                    <summary className="cursor-pointer font-medium text-ink">
                      Ingredients and method
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <h4 className="font-medium text-ink">Ingredients</h4>
                        <ul className="list-disc pl-5 text-ink">
                          {meal.ingredients.map((ing, i) => (
                            <li key={i}>
                              {ing.amount} {ing.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-ink">Method</h4>
                        <ol className="list-decimal pl-5 text-ink">
                          {meal.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    {meal.substitutions.length > 0 && (
                      <p className="mt-2 text-muted">
                        Swaps:{" "}
                        {meal.substitutions
                          .map((s) => `${s.alternative} instead of ${s.ingredient}`)
                          .join("; ")}
                      </p>
                    )}
                  </details>
                  {adjustmentsLeft > 0 && (
                    <details className="print:hidden">
                      <summary className="cursor-pointer text-brand-text">
                        Replace this meal
                      </summary>
                      <div className="mt-2">
                        <ActionForm
                          action={replaceMealAction.bind(
                            null,
                            plan.id,
                            weekIndex,
                            dayIndex,
                            mealIndex,
                          )}
                          submitLabel="Replace meal"
                          pendingLabel="Replacing…"
                          variant="secondary"
                        >
                          <Field
                            id={`reason-${dayIndex}-${mealIndex}`}
                            name="reason"
                            label="Why? (optional)"
                            placeholder="e.g. we don't like beans"
                            maxLength={200}
                          />
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </article>
              ))}
              {n && (
                <p className="text-sm text-muted">
                  {showNutrition(n)
                    ? `Approximately ${n.energyKcal ?? "?"} kcal, ${n.proteinG ?? "?"} g protein and ${n.fiberG ?? "?"} g fibre for the whole household this day, from ${n.counted} of ${n.total} ingredients matched to our food database.`
                    : "Nutrition is not shown for this day: too few ingredients matched our food database with a reliable amount."}
                </p>
              )}
            </div>
          </Card>
        );
      })}

      {shopping && shopping.lines.length > 0 && (
        <Card
          title={`Shopping list for week ${weekIndex + 1}`}
          description="Amounts are for the whole household. Prices are estimates for items we have price data for."
        >
          <ul className="flex flex-col divide-y divide-line text-sm">
            {shopping.lines.map((line) => (
              <li key={line.name} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-ink">
                  {line.name}
                  <span className="text-muted">
                    {" "}
                    ·{" "}
                    {line.grams
                      ? `about ${Math.round(line.grams)} g`
                      : line.pieces
                        ? `${line.pieces} pieces`
                        : line.amounts.slice(0, 3).join(" + ")}
                  </span>
                </span>
                {line.cost !== undefined && (
                  <span className="text-ink">≈ {formatNaira(line.cost)}</span>
                )}
              </li>
            ))}
          </ul>
          {shopping.pricedCount > 0 && (
            <p className="mt-3 text-sm text-ink">
              Estimated cost of {shopping.pricedCount} priced item
              {shopping.pricedCount === 1 ? "" : "s"}:{" "}
              <span className="font-semibold">{formatNaira(shopping.total)}</span>
              {shopping.source && (
                <span className="text-muted">
                  {" "}
                  (estimates from{" "}
                  <a
                    href={shopping.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {shopping.source.name}
                  </a>
                  , {shopping.source.month}; not current market prices)
                </span>
              )}
            </p>
          )}
        </Card>
      )}
      {!shopping && week && (
        <p className="text-sm text-muted print:hidden">
          A priced shopping list comes with plans that include it.{" "}
          <Link href="/account" className="underline">
            See plans
          </Link>
          .
        </p>
      )}

      <div className="flex flex-col gap-4 print:hidden">
        {plan.weeks.length < totalWeeks && (
          <Card
            title={`Write week ${plan.weeks.length + 1}`}
            description="Weeks are written one at a time, each different from the last."
          >
            <ActionForm
              action={nextWeekAction.bind(null, plan.id)}
              submitLabel={`Write week ${plan.weeks.length + 1}`}
              pendingLabel="Writing… this can take a minute"
            />
          </Card>
        )}
        {week && (
          <Card
            title="Adjust this week"
            description={
              adjustmentsLeft > 0
                ? `Tell the planner what to change. ${adjustmentsLeft} adjustment${adjustmentsLeft === 1 ? "" : "s"} left this week.`
                : "You have used this week's adjustments."
            }
          >
            {adjustmentsLeft > 0 && (
              <ActionForm
                action={adjustWeekAction.bind(null, plan.id, weekIndex)}
                submitLabel="Rewrite this week"
                pendingLabel="Rewriting… this can take a minute"
              >
                <Field
                  id="feedback"
                  name="feedback"
                  label="What would you like changed?"
                  placeholder="e.g. less rice, more fish, quicker breakfasts"
                  maxLength={400}
                  required
                />
              </ActionForm>
            )}
          </Card>
        )}
        <ProductRecommendations cards={products} heading="Products for this week's shopping" />
        {nutritionists.length > 0 && (
          <section aria-label="Nutritionists who could help" className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">Want personal advice?</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {nutritionists.map((card) => (
                <li key={card.id}>
                  <NutritionistCardView card={card} compact />
                </li>
              ))}
            </ul>
          </section>
        )}
        <form action={deletePlanAction.bind(null, plan.id)}>
          <Button type="submit" variant="ghost">
            Delete this plan
          </Button>
        </form>
      </div>
    </div>
  );
}
