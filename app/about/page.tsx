import type { Metadata } from "next";
import { Icon } from "@/components/site/icons";
import {
  CheckList,
  CtaPanel,
  FeatureCard,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/site/marketing";
import { SiteFrame } from "@/components/site/site-shell";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Nutraboom Equals is an AI-powered nutrition platform for Nigeria that connects families with trusted food information, nutritionists, hospitals and food businesses.",
  alternates: { canonical: "/about" },
};

const AUDIENCES = [
  {
    icon: "users",
    title: "Families and individuals",
    points: [
      "Free answers to everyday food questions, any time",
      "Meal plans and shopping lists that respect your budget",
      "Allergies and sensitive situations handled with care",
    ],
  },
  {
    icon: "stethoscope",
    title: "Nutritionists",
    points: [
      "A verified profile people can trust",
      "Referrals matched to your specialisations",
      "Your clients, your fees, your terms",
    ],
  },
  {
    icon: "hospital",
    title: "Hospitals",
    points: [
      "Appointments booked within your opening times",
      "Messages from patients routed to the right team",
      "Accessible care for deaf, blind and speech-impaired patients",
    ],
  },
  {
    icon: "store",
    title: "Food businesses",
    points: [
      "Products reviewed and presented with full details",
      "Suggested only when they fit what people plan to eat",
      "Clear counts of views and shop-link clicks",
    ],
  },
] as const;

/** About Nutraboom Equals (ADR-070): who we are, why, and how the platform fits together. */
export default function AboutPage() {
  return (
    <SiteFrame width="full">
      <PageHero
        eyebrow="About us"
        title={
          <>
            Nutrition that is <span className="text-brand-text">equal for everyone</span>
          </>
        }
        intro="Nutraboom Equals is an AI-powered nutrition platform built in Nigeria, for Nigeria. We help families understand their food, plan meals they can afford, and reach trusted professionals when they need more."
        actions={
          <>
            <ButtonLink href="/" size="lg">
              Try the assistant
            </ButtonLink>
            <ButtonLink href="/sign-up" variant="secondary" size="lg">
              Create an account
            </ButtonLink>
          </>
        }
        aside={
          <div className="relative mx-auto w-full max-w-md">
            <div
              aria-hidden="true"
              className="absolute -top-8 -left-8 size-28 rounded-full bg-gold/60"
            />
            <div className="relative rounded-[2rem] border border-line bg-surface p-8 shadow-[0_24px_60px_-28px_rgba(38,70,83,0.55)]">
              <p className="font-display text-2xl leading-snug font-semibold text-ink">
                Good food advice shouldn&apos;t depend on how much you earn or where you live.
              </p>
              <p className="mt-4 text-sm text-muted">The idea behind Equals</p>
            </div>
          </div>
        }
      />

      <Section labelledBy="who-title" tone="tint">
        <div className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            id="who-title"
            align="left"
            eyebrow="Who we are"
            title="Part of the Nutraboom family"
            intro="Nutraboom has helped Nigerian families feed their children with natural, locally made cereals since 2019. Nutraboom Equals carries that care beyond one product: an assistant that knows Nigerian foods and markets, and a network of professionals and businesses that families can rely on."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-3xl border border-line bg-surface p-6">
              <h3 className="font-display text-xl font-semibold text-ink">Our mission</h3>
              <p className="mt-2 leading-relaxed text-muted">
                To make sound, practical nutrition guidance free and easy to reach for every
                household in Nigeria, in plain language and within real budgets.
              </p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6">
              <h3 className="font-display text-xl font-semibold text-ink">Our vision</h3>
              <p className="mt-2 leading-relaxed text-muted">
                A country where every family can eat well, and where nutritionists, hospitals and
                food businesses work together to make that possible.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section labelledBy="offer-title">
        <SectionHeading
          id="offer-title"
          eyebrow="What we offer"
          title="One platform, from first question to expert care"
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <FeatureCard icon="chat" title="Nutrition assistant">
              Food facts, comparisons, meal ideas and budget plans, by text or voice. No account
              needed.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="calendar" title="Meal Planner" tone="gold">
              Plans from a day to a year, with recipes, portions, nutrition and shopping lists.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="basket" title="Product directory">
              Verified food products with ingredients, allergens and where to buy them.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="stethoscope" title="Nutritionist directory">
              Qualified professionals, checked by our reviewers, online or in person.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="hospital" title="Hospital access" tone="gold">
              Find accessible hospitals, book appointments and message staff.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="mic" title="Voice">
              Speak your question and listen to replies, in supported browsers.
            </FeatureCard>
          </li>
        </ul>
      </Section>

      <Section labelledBy="features-title" tone="deep">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <SectionHeading
            id="features-title"
            align="left"
            tone="light"
            eyebrow="Key features"
            title="Careful by design"
            intro="An AI is good at conversation. It is not a nutrition database, a calculator or a doctor, so we don't let it act like one."
          />
          <CheckList
            tone="light"
            items={[
              "Nutrition values come from the FAO/INFOODS food composition table for West Africa and USDA serving weights, with sources recorded.",
              "Prices are estimates built from National Bureau of Statistics market data, and always labelled as estimates.",
              "Totals, remaining budget and nutrition are calculated by the app, not by the AI.",
              "Declared allergies are checked against every suggestion, swap and product.",
              "Pregnancy, children under 5 and medical conditions get extra caution and a clear nudge to see a professional.",
              "No diagnoses, no prescriptions, no medicine doses. Emergencies are told to call 112.",
            ]}
          />
        </div>
      </Section>

      <Section labelledBy="benefits-title">
        <SectionHeading
          id="benefits-title"
          eyebrow="Benefits"
          title="Value for everyone in the nutrition ecosystem"
        />
        <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <li
              key={a.title}
              className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-6"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
                <Icon name={a.icon} className="size-6" />
              </span>
              <h3 className="font-display text-xl font-semibold text-ink">{a.title}</h3>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
                {a.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand-text" />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="approach-title" tone="tint">
        <SectionHeading
          id="approach-title"
          eyebrow="Our approach"
          title="Start simple. Bring in experts when it matters."
          intro="Most food questions need a clear answer, not an appointment. Some need a professional. We connect the two."
        />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            [
              "chat",
              "Ask",
              "Anyone can ask the assistant about food, meals or a budget, free and without signing up.",
            ],
            [
              "sparkles",
              "Plan",
              "Save meal plans and shopping lists, and see trusted products that fit what you're cooking.",
            ],
            [
              "users",
              "Connect",
              "When a situation needs a professional, we suggest verified nutritionists and accessible hospitals near you.",
            ],
          ].map(([icon, title, text], i) => (
            <li key={title} className="relative rounded-3xl border border-line bg-surface p-7">
              <span
                className="absolute top-6 right-6 font-display text-5xl font-bold text-gold/60"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <Icon name={icon as "chat"} className="size-8 text-brand-text" />
              <h3 className="mt-4 font-display text-2xl font-semibold text-ink">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Accessibility commitment (ADR-084); linked from the home page. */}
      <Section id="accessibility" labelledBy="accessibility-title">
        <div className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            id="accessibility-title"
            align="left"
            eyebrow="Accessibility"
            title="Our commitment to accessible nutrition help"
            intro="People who are blind, have low vision, are deaf or hard of hearing, or find reading hard deserve the same help. We design for them from the start, not as an afterthought."
          />
          <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface p-7">
            <CheckList
              items={[
                "We follow the WCAG 2.2 AA guidelines and test every release with automated checks, a keyboard and a screen reader.",
                "Every reply can be read aloud, and you can ask by voice; you always see the words as text too.",
                "Pictures in replies come with a written description, so the explanation never depends on seeing them.",
                "Partner hospitals publish their access services, such as sign-language interpreters, and take messages by text or voice.",
                "Sign-language video responses are a preview today. We will say clearly when real interpretation is available.",
              ]}
            />
            <p className="text-sm text-muted">
              Something hard to use? Tell us, and we will fix it.
            </p>
          </div>
        </div>
      </Section>

      <CtaPanel
        id="about-cta"
        title="Join us in making good nutrition equal"
        text="Explore trusted products, create a free account, or partner with us as a nutritionist, hospital or food business."
      >
        <ButtonLink href="/products" variant="gold" size="lg">
          Explore products
        </ButtonLink>
        <ButtonLink href="/for-nutritionists" variant="light" size="lg">
          For nutritionists
        </ButtonLink>
        <ButtonLink href="/for-vendors" variant="light" size="lg">
          For vendors
        </ButtonLink>
      </CtaPanel>
    </SiteFrame>
  );
}
