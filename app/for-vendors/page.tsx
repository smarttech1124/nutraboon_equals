import type { Metadata } from "next";
import { connection } from "next/server";
import {
  CheckList,
  CtaPanel,
  Faq,
  FeatureCard,
  PageHero,
  Section,
  SectionHeading,
  Steps,
} from "@/components/site/marketing";
import { SiteShell } from "@/components/site/site-shell";
import { ButtonLink } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { PRODUCT_CATEGORIES } from "@/lib/vendors/categories";

export const metadata: Metadata = {
  title: "For vendors",
  description:
    "List your nutritious food products on Nutraboom Equals: a reviewed product page, a place in our directory, and clearly labelled suggestions when your product fits what people plan to eat.",
  alternates: { canonical: "/for-vendors" },
};

/** Landing page for food businesses (ADR-067, ADR-070). */
export default async function ForVendorsPage() {
  // Per request: the call to action depends on whether onboarding is open.
  await connection();
  const open = await getEntitlementService().isEnabled("vendors");
  const join = open ? "/vendor/join" : "/sign-up";
  const joinLabel = open ? "Register your business" : "Create an account";

  return (
    <SiteShell session width="full">
      <PageHero
        eyebrow="For food businesses"
        title={
          <>
            Put your products where <span className="text-brand-text">meals are planned</span>
          </>
        }
        intro="Nutraboom Equals helps Nigerian families decide what to cook and what to buy. List your nutritious food products, and they can be suggested at exactly that moment, to the people they suit."
        actions={
          <>
            <ButtonLink href={join} size="lg">
              {joinLabel}
            </ButtonLink>
            <ButtonLink href="/products" variant="secondary" size="lg">
              See the product directory
            </ButtonLink>
            {!open && (
              <p className="w-full text-sm text-muted">
                Vendor registration opens soon. Create your account now to be first in line.
              </p>
            )}
          </>
        }
        aside={
          <div className="relative mx-auto w-full max-w-md">
            <div
              aria-hidden="true"
              className="absolute -top-6 -right-6 size-28 rounded-full bg-gold/60"
            />
            <div className="relative flex flex-col gap-4 rounded-[2rem] border border-line bg-surface p-7 shadow-[0_24px_60px_-28px_rgba(38,70,83,0.55)]">
              <p className="inline-flex self-start rounded-full bg-gold-soft px-3 py-1 text-xs font-bold tracking-wide text-gold-text uppercase">
                Sponsored · verified vendor
              </p>
              <p className="font-display text-xl font-semibold text-ink">
                How your product appears
              </p>
              <CheckList
                items={[
                  "Name, photo and a short description",
                  "Ingredients and allergens, always visible",
                  "Your nutrition label, marked as yours",
                  "Where to buy, online or in stores",
                ]}
              />
            </div>
          </div>
        }
      />

      <Section labelledBy="benefits-title" tone="tint">
        <SectionHeading
          id="benefits-title"
          eyebrow="Why list with us"
          title="Reach families at the moment they decide"
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <FeatureCard icon="sparkles" title="Relevant suggestions">
              Your product is suggested only when it matches foods the assistant or Meal Planner is
              already recommending.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="shield" title="Trust built in" tone="gold">
              Every business and product is reviewed. Suggestions never ignore allergies or the
              rules for pregnancy and young children.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="basket" title="A product page">
              A page in our directory with your details, and links to where people can buy.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="chart" title="Simple insights" tone="gold">
              See how often your products are suggested, opened and clicked, over the last 30 days.
            </FeatureCard>
          </li>
        </ul>
      </Section>

      <Section labelledBy="onboarding-title">
        <SectionHeading
          id="onboarding-title"
          eyebrow="Onboarding"
          title="Four steps to your first listing"
        />
        <div className="mt-12">
          <Steps
            steps={[
              { title: "Create your account", text: "Sign up with your email or Google account." },
              {
                title: "Add your business",
                text: "Your business name, categories, location and contact details, and your CAC registration number if you have one.",
              },
              {
                title: "Add products",
                text: "Description, ingredients, allergens, an optional nutrition label, a photo and where to buy.",
              },
              {
                title: "Get reviewed",
                text: "Our team reviews your business and each product. Approved products go live.",
              },
            ]}
          />
        </div>
      </Section>

      <Section labelledBy="standards-title" tone="deep">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading
              id="standards-title"
              align="left"
              tone="light"
              eyebrow="Our standards"
              title="Honest products, honestly presented"
              intro="People trust our suggestions because we keep them clean. Our checks are automatic and our reviewers read every product."
            />
            <CheckList
              tone="light"
              items={[
                "No claims that a product treats, cures or prevents disease.",
                "No breast-milk substitutes, in line with the International Code of Marketing of Breast-milk Substitutes.",
                "Allergens declared by you and detected from your ingredients.",
                "Every suggestion is labelled as sponsored, separate from nutrition advice.",
              ]}
            />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold">Categories we list</h3>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {Object.values(PRODUCT_CATEGORIES).map((c) => (
                <li
                  key={c}
                  className="rounded-full bg-white/10 px-4 py-2 text-sm ring-1 ring-white/20"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section labelledBy="faq-title">
        <SectionHeading id="faq-title" eyebrow="Questions" title="Frequently asked questions" />
        <div className="mt-10">
          <Faq
            items={[
              {
                q: "Does Nutraboom Equals sell my products?",
                a: "No. We show your product and link people to where they can buy it. Orders, payment and delivery stay with you and your sellers.",
              },
              {
                q: "How much does it cost?",
                a: "Listing options and how many products you can list are shown on the Plan page of your vendor portal.",
              },
              {
                q: "When will my product be suggested?",
                a: "Only when it matches a food already being recommended, is in stock, and is safe for the person: never against an allergy, an avoided food, or the rules for pregnancy and young children.",
              },
              {
                q: "What data will I see?",
                a: "Daily counts of how often each product was suggested, opened and clicked through. We never share who the people were.",
              },
              {
                q: "Can I list baby food?",
                a: "Yes, food for babies and young children can be listed. Infant formula, follow-on and growing-up milks cannot.",
              },
            ]}
          />
        </div>
      </Section>

      <CtaPanel
        id="vendors-cta"
        title="Bring your products to Nigerian kitchens"
        text={
          open
            ? "Register your business and add your first product today."
            : "Vendor registration opens soon. Create an account to be ready."
        }
      >
        <ButtonLink href={join} variant="gold" size="lg">
          {joinLabel}
        </ButtonLink>
        <ButtonLink href="/about" variant="light" size="lg">
          About Nutraboom Equals
        </ButtonLink>
      </CtaPanel>
    </SiteShell>
  );
}
