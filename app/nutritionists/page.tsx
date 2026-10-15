import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/coming-soon";
import { connection } from "next/server";
import { NutritionistCardView } from "@/components/nutritionists/card";
import { Card, EmptyState } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { canonicalState, STATES } from "@/lib/budget/regions";
import { findNutritionists } from "@/lib/nutritionists/directory";
import {
  isSpecialization,
  SESSION_TYPE_LABEL,
  SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
} from "@/lib/nutritionists/specializations";

export const metadata: Metadata = { title: "Find a nutritionist" };

const SELECT = "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink";

/** The directory of verified, listed nutritionists, ordered by the matching rules (ADR-064). */
export default async function DirectoryPage({ searchParams }: PageProps<"/nutritionists">) {
  // Per request: the feature flag and listings change without a deploy.
  await connection();
  if (!(await getEntitlementService().isEnabled("nutritionists"))) {
    return (
      <ComingSoon
        icon="stethoscope"
        title="Find a nutritionist"
        text="We are checking the qualifications of our first nutritionists and dietitians. Until then, the assistant can answer everyday food questions."
        partnerHref="/for-nutritionists"
        partnerLabel="Join as a nutritionist"
      />
    );
  }
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const state = canonicalState(str(params.state)) ?? null;
  const specialization = str(params.need);
  const sessionType = str(params.type);
  const cards = await findNutritionists({
    state,
    specializations: isSpecialization(specialization) ? [specialization] : [],
    sessionType: sessionType === "online" || sessionType === "in_person" ? sessionType : undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Find a nutritionist</h1>
        <p className="mt-1 text-muted">
          Every nutritionist here has had their qualifications checked by our reviewers. Sessions
          are arranged and paid directly with the nutritionist.
        </p>
      </div>
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-4 sm:items-end"
          role="search"
          aria-label="Filter nutritionists"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Your state
            <select name="state" defaultValue={state ?? ""} className={SELECT}>
              <option value="">Anywhere</option>
              {[...STATES].sort().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Help with
            <select
              name="need"
              defaultValue={isSpecialization(specialization) ? specialization : ""}
              className={SELECT}
            >
              <option value="">Anything</option>
              {SPECIALIZATION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SPECIALIZATIONS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Session
            <select name="type" defaultValue={sessionType} className={SELECT}>
              <option value="">Online or in person</option>
              {Object.entries(SESSION_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
          >
            Search
          </button>
        </form>
      </Card>
      <section aria-label="Nutritionists">
        {cards.length === 0 ? (
          <Card>
            <EmptyState title="No nutritionists match yet">
              Try another state, or choose online sessions.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((card) => (
              <li key={card.id}>
                <NutritionistCardView card={card} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
