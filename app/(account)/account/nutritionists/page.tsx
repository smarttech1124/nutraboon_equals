import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SessionsSection } from "@/components/account/sessions-section";
import { NutritionistCardView } from "@/components/nutritionists/card";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { findNutritionists } from "@/lib/nutritionists/directory";

export const metadata: Metadata = { title: "Meet a nutritionist" };

/**
 * Nutritionists in the account dashboard (ADR-075): your session requests and
 * verified nutritionists to meet. Booking is a session request on each
 * profile page (ADR-064); fees are paid to the nutritionist directly.
 */
export default async function AccountNutritionists() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account/nutritionists");
  const enabled = await getEntitlementService().isEnabled("nutritionists");
  const cards = enabled ? await findNutritionists({}, 6) : [];
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-ink">Meet a nutritionist</h1>
      {!enabled ? (
        <Card title="Coming soon">
          <p className="text-sm text-muted">
            We are verifying our first nutritionists. Check back soon.
          </p>
        </Card>
      ) : (
        <>
          <SessionsSection user={user} />
          <section aria-labelledby="meet-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="meet-title" className="font-display text-2xl font-semibold text-ink">
                  Verified nutritionists
                </h2>
                <p className="text-sm text-muted">
                  Open a profile to see availability and request a session. You arrange and pay for
                  sessions with the nutritionist directly.
                </p>
              </div>
              <ButtonLink href="/nutritionists" variant="secondary">
                Search all nutritionists
              </ButtonLink>
            </div>
            {cards.length === 0 ? (
              <EmptyState title="No nutritionists are listed yet">
                <Link href="/nutritionists" className="text-brand-text underline">
                  Try the directory later
                </Link>
              </EmptyState>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {cards.map((card) => (
                  <li key={card.id}>
                    <NutritionistCardView card={card} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
