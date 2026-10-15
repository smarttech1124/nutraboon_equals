import Link from "next/link";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { ChatPreview } from "@/components/home/ChatPreview";
import { Icon } from "@/components/site/icons";
import {
  CheckList,
  CtaPanel,
  Eyebrow,
  FeatureCard,
  Section,
  SectionHeading,
} from "@/components/site/marketing";
import { SiteFrame } from "@/components/site/site-shell";
import { ButtonLink } from "@/components/ui";

const PROMISES = [
  {
    icon: "leaf",
    title: "Nigerian foods first",
    text: "Garri, ugu, beans, plantain, egusi and more.",
  },
  {
    icon: "wallet",
    title: "Budget-aware",
    text: "Uses what you have before suggesting what to buy.",
  },
  {
    icon: "shield",
    title: "Safety built in",
    text: "Careful with allergies, pregnancy and young children.",
  },
  { icon: "mic", title: "Type or speak", text: "Ask by voice and have replies read aloud." },
] as const;

/** Accessibility features, each one real and available today (ADR-084). */
const ACCESS = [
  {
    icon: "eye",
    title: "Screen readers and keyboard",
    text: "Clear headings, labels and announcements, so screen readers read every reply. Everything works with a keyboard alone.",
  },
  {
    icon: "ear",
    title: "Listen to replies",
    text: "Press Listen on any reply to hear it read aloud, or have spoken questions answered aloud automatically.",
  },
  {
    icon: "mic",
    title: "Speak instead of typing",
    text: "Ask with your voice. You see what was heard before it is sent, so nothing is sent by mistake.",
  },
  {
    icon: "hand",
    title: "Sign language (preview)",
    text: "A sign-language video can accompany replies. It is a demonstration today while we work with sign-language partners.",
  },
  {
    icon: "chat",
    title: "Everything in writing",
    text: "Every spoken reply is also shown as text, and pictures come with written descriptions.",
  },
  {
    icon: "hospital",
    title: "Accessible hospital care",
    text: "Partner hospitals list their access services, and you can message staff by text or voice.",
  },
] as const;

/**
 * The home page (ADR-070): what Nutraboom Equals does, who it serves, and
 * the assistant one tap away. Static: no session read, so it loads fast.
 */
export default function HomePage() {
  return (
    <>
      <SiteFrame width="full">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(60rem_30rem_at_85%_10%,color-mix(in_oklab,var(--gold)_30%,transparent),transparent_70%)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-24">
            <div className="flex flex-col items-start gap-6">
              <Eyebrow>AI-powered nutrition for Nigeria</Eyebrow>
              <h1
                id="hero-title"
                className="font-display text-[2.6rem] leading-[1.08] font-bold text-ink sm:text-6xl"
              >
                Learn, plan, and get help <span className="text-brand-text">in your language.</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                Ask a friendly assistant about Nigerian and everyday foods, plan meals for your
                household and your budget, and find verified nutritionists, accessible hospitals and
                trusted food products. Type or speak, listen to replies, and use it with a screen
                reader or keyboard.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ChatLauncher />
                <ButtonLink href="/products" variant="secondary" size="lg">
                  Explore products
                </ButtonLink>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {[
                  "Free to use",
                  "No account needed to chat",
                  "English, Yorùbá and Igbo",
                  "Built for screen readers",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Icon name="check" className="size-4 text-brand-text" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <ChatPreview />
          </div>
        </section>

        {/* Promise band */}
        <section aria-label="Why people use Nutraboom Equals" className="bg-brand text-white">
          <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <Icon name={p.icon} className="size-6" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold">{p.title}</p>
                  <p className="mt-1 text-sm leading-relaxed opacity-90">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Accessibility (ADR-084) */}
        <Section labelledBy="access-title">
          <SectionHeading
            id="access-title"
            eyebrow="Accessible to everyone"
            title="Made for people who are blind, deaf, or hard of hearing too"
            intro="Good nutrition help should not depend on how you see, hear or read. Every part of Nutraboom Equals is built to work with assistive technology, and we test it against the WCAG 2.2 AA standard."
          />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ACCESS.map((a) => (
              <li key={a.title}>
                <FeatureCard icon={a.icon} title={a.title}>
                  {a.text}
                </FeatureCard>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center">
            <Link href="/about#accessibility" className="font-semibold text-brand-text underline">
              Read our accessibility commitment
            </Link>
          </p>
        </Section>

        {/* About */}
        <Section labelledBy="about-title">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <SectionHeading
              id="about-title"
              align="left"
              eyebrow="About Nutraboom Equals"
              title="Good nutrition advice should be easy to get, and easy to afford"
              intro="Nutraboom Equals brings the Nutraboom family's care for Nigerian nutrition to everyone with a phone. Our assistant answers everyday food questions in plain words and plans meals around real budgets, while our network connects you with professionals when you need more than general advice."
            />
            <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface p-7">
              <CheckList
                items={[
                  "Nutrition facts from the FAO food composition table for West Africa, not guesswork.",
                  "Shopping lists priced from public market data, always shown as estimates.",
                  "Allergies you mention are remembered and left out of every suggestion.",
                  "Extra care, and a nudge to see a professional, for pregnancy and children under 5.",
                ]}
              />
              <ButtonLink href="/about" variant="secondary" className="self-start">
                More about us <Icon name="arrow" className="size-4" />
              </ButtonLink>
            </div>
          </div>
        </Section>

        {/* Products and solutions */}
        <Section labelledBy="solutions-title" tone="tint">
          <SectionHeading
            id="solutions-title"
            eyebrow="Products and solutions"
            title="Everything you need to eat well"
            intro="Start with a question. Go further with a weekly plan, a trusted product or a professional."
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <FeatureCard icon="chat" title="Nutrition assistant">
                Ask about any food, compare fruits, or plan tonight&apos;s dinner. Free, with no
                account.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="calendar" title="Meal Planner">
                Weekly plans with recipes, portions, nutrition and a priced shopping list.{" "}
                <Link href="/planner" className="font-semibold text-brand-text underline">
                  Open the planner
                </Link>
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="basket" title="Verified products" tone="gold">
                Food products from reviewed Nigerian businesses, with ingredients and allergens.{" "}
                <Link href="/products" className="font-semibold text-brand-text underline">
                  Browse products
                </Link>
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="stethoscope" title="Nutritionists">
                Professionals whose qualifications we have checked, online or near you.{" "}
                <Link href="/nutritionists" className="font-semibold text-brand-text underline">
                  Find one
                </Link>
              </FeatureCard>
            </li>
          </ul>
        </Section>

        {/* Hospitals */}
        <Section labelledBy="hospitals-title" tone="deep">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-6">
              <SectionHeading
                id="hospitals-title"
                align="left"
                tone="light"
                eyebrow="Hospital partnerships"
                title="Care that everyone can reach"
                intro="Partner hospitals list their departments and accessibility services, take appointments, and talk with patients who are deaf, hard of hearing, blind or speech-impaired, by text or voice."
              />
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/hospitals" variant="gold" size="lg">
                  Find a hospital
                </ButtonLink>
                <ButtonLink href="/hospital/join" variant="light" size="lg">
                  Register your hospital
                </ButtonLink>
              </div>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                [
                  "pin",
                  "Near you",
                  "Search by town or your location, and widen the distance if you need to.",
                ],
                [
                  "calendar",
                  "Book ahead",
                  "Choose a department and a time, and tell the team what would help you.",
                ],
                ["ear", "Accessible messaging", "Type or speak; staff replies can be read aloud."],
                [
                  "shield",
                  "Routed with care",
                  "Messages reach the right team. Emergencies are told to call 112 at once.",
                ],
              ].map(([icon, title, text]) => (
                <li key={title} className="rounded-3xl bg-white/8 p-5 ring-1 ring-white/15">
                  <Icon name={icon as "pin"} className="size-6 text-gold" />
                  <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed opacity-85">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* Nutritionists and vendors */}
        <Section labelledBy="partners-title">
          <SectionHeading
            id="partners-title"
            eyebrow="Grow with us"
            title="For nutrition professionals and food businesses"
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article
              aria-labelledby="for-nutritionists-title"
              className="flex flex-col gap-5 rounded-[2rem] border border-line bg-surface p-8"
            >
              <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
                <Icon name="stethoscope" className="size-7" />
              </span>
              <h3 id="for-nutritionists-title" className="font-display text-2xl font-bold text-ink">
                For nutritionists
              </h3>
              <p className="leading-relaxed text-muted">
                Get a verified profile, appear in our directory and in the assistant&apos;s
                suggestions when someone needs professional help, and manage session requests from
                one portal. You keep your clients, your fees and your terms.
              </p>
              <ButtonLink href="/for-nutritionists" className="mt-auto self-start">
                Join as a nutritionist <Icon name="arrow" className="size-4" />
              </ButtonLink>
            </article>
            <article
              aria-labelledby="for-vendors-title"
              className="flex flex-col gap-5 rounded-[2rem] border border-line bg-surface p-8"
            >
              <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-gold-soft text-gold-text">
                <Icon name="store" className="size-7" />
              </span>
              <h3 id="for-vendors-title" className="font-display text-2xl font-bold text-ink">
                For vendors
              </h3>
              <p className="leading-relaxed text-muted">
                List your nutritious food products with full ingredient and allergen details. Once
                reviewed, they appear in our product directory and as clearly labelled suggestions
                when they match what people are planning to eat.
              </p>
              <ButtonLink href="/for-vendors" className="mt-auto self-start">
                Become a vendor <Icon name="arrow" className="size-4" />
              </ButtonLink>
            </article>
          </div>
        </Section>

        {/* Features and benefits */}
        <Section labelledBy="features-title" tone="tint">
          <SectionHeading
            id="features-title"
            eyebrow="Features and benefits"
            title="Built for real kitchens and real budgets"
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <FeatureCard icon="chart" title="Real numbers">
                Calories, vitamins and minerals are calculated by the app from trusted food data,
                never invented by the AI.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="wallet" title="Your money, stretched" tone="gold">
                Tell us your budget and what&apos;s at home. You get what to buy, an estimated total
                and what&apos;s left.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="users" title="Whole-family plans">
                Plans for every age in the house, including school lunchboxes, asked one question at
                a time.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="shield" title="Allergy-safe suggestions">
                Declared allergies are checked against every meal, swap and product we suggest.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="globe" title="Your language" tone="gold">
                Replies in Nigerian English, with Yorùbá and Igbo in beta.
              </FeatureCard>
            </li>
            <li>
              <FeatureCard icon="lock" title="Private by design">
                Chat without an account. Conversations are deleted two hours after your last
                message.
              </FeatureCard>
            </li>
          </ul>
        </Section>

        <CtaPanel
          id="cta-title"
          title="Eat better, starting with your next meal"
          text="Create a free account to save meal plans and book professionals, or simply ask the assistant a question now."
        >
          <ButtonLink href="/sign-up" variant="gold" size="lg">
            Create a free account
          </ButtonLink>
          <ButtonLink href="/for-vendors" variant="light" size="lg">
            Partner with us
          </ButtonLink>
        </CtaPanel>
      </SiteFrame>
    </>
  );
}
