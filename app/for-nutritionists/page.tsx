import type { Metadata } from "next";
import { connection } from "next/server";
import { Icon } from "@/components/site/icons";
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
import { SPECIALIZATION_KEYS, SPECIALIZATIONS } from "@/lib/nutritionists/specializations";

export const metadata: Metadata = {
  title: "For nutritionists",
  description:
    "Join Nutraboom Equals as a verified nutritionist or dietitian: a trusted profile, referrals matched to your specialisations, and session requests in one portal.",
  alternates: { canonical: "/for-nutritionists" },
};

/** Landing page for nutrition professionals (ADR-064, ADR-070). */
export default async function ForNutritionistsPage() {
  // Per request: the call to action depends on whether onboarding is open.
  await connection();
  const open = await getEntitlementService().isEnabled("nutritionists");
  const join = open ? "/nutritionist/join" : "/sign-up";
  const joinLabel = open ? "Join as a nutritionist" : "Create an account";

  return (
    <SiteShell session width="full">
      <PageHero
        eyebrow="For nutritionists and dietitians"
        title={
          <>
            Reach the people who <span className="text-brand-text">need your expertise</span>
          </>
        }
        intro="Every day, people ask our assistant questions that deserve a professional: a pregnancy, a diagnosis of diabetes, a child who won't eat. Nutraboom Equals points them to verified nutritionists like you."
        actions={
          <>
            <ButtonLink href={join} size="lg">
              {joinLabel}
            </ButtonLink>
            <ButtonLink href="/nutritionists" variant="secondary" size="lg">
              See the directory
            </ButtonLink>
            {!open && (
              <p className="w-full text-sm text-muted">
                Applications open soon. Create your account now and we&apos;ll be ready when you
                are.
              </p>
            )}
          </>
        }
        aside={
          <div className="relative mx-auto w-full max-w-md">
            <div
              aria-hidden="true"
              className="absolute -right-6 -bottom-6 size-32 rounded-full bg-gold/60"
            />
            <div className="relative flex flex-col gap-4 rounded-[2rem] border border-line bg-surface p-7 shadow-[0_24px_60px_-28px_rgba(38,70,83,0.55)]">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                  <Icon name="stethoscope" className="size-6" />
                </span>
                <div>
                  <p className="font-semibold text-ink">Your verified profile</p>
                  <p className="text-sm text-muted">What people see in the directory</p>
                </div>
              </div>
              <CheckList
                items={[
                  "Qualifications checked by our reviewers",
                  "Your specialisations and languages",
                  "Online or in-person sessions, and where",
                  "Your session fee and how to reach you",
                ]}
              />
            </div>
          </div>
        }
      />

      <Section labelledBy="value-title" tone="tint">
        <SectionHeading
          id="value-title"
          eyebrow="Why join"
          title="A simple way to grow your practice"
          intro="We don't stand between you and your clients. We help the right people find you."
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <FeatureCard icon="shield" title="Trusted profile">
              A verified badge shows people your qualifications have been reviewed.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="sparkles" title="Matched referrals" tone="gold">
              When a conversation needs a professional, the assistant suggests nutritionists whose
              specialisations fit.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="calendar" title="One portal">
              Profile, qualifications, weekly availability and session requests, all in one place.
            </FeatureCard>
          </li>
          <li>
            <FeatureCard icon="wallet" title="Your terms" tone="gold">
              You arrange sessions and payment directly with clients. We show your fee; we take no
              commission on sessions.
            </FeatureCard>
          </li>
        </ul>
      </Section>

      <Section labelledBy="how-title">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="From sign-up to first request"
        />
        <div className="mt-12">
          <Steps
            steps={[
              { title: "Create your account", text: "Sign up with your email or Google account." },
              {
                title: "Build your profile",
                text: "Add your qualifications, registration details, specialisations, availability and session fee.",
              },
              {
                title: "Get verified",
                text: "Our reviewers check your documents. You'll hear from us by email and in your portal.",
              },
              {
                title: "Receive requests",
                text: "Appear in the directory and in suggestions, and answer session requests from your portal.",
              },
            ]}
          />
        </div>
      </Section>

      <Section labelledBy="cases-title" tone="deep">
        <div className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            id="cases-title"
            align="left"
            tone="light"
            eyebrow="Who you'll meet"
            title="People with real questions"
            intro="The assistant handles everyday food questions and knows its limits. When someone needs personal advice, it suggests a professional in the right area:"
          />
          <ul className="flex flex-wrap content-start gap-2.5">
            {SPECIALIZATION_KEYS.map((k) => (
              <li
                key={k}
                className="rounded-full bg-white/10 px-4 py-2 text-sm ring-1 ring-white/20"
              >
                {SPECIALIZATIONS[k]}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section labelledBy="faq-title">
        <SectionHeading id="faq-title" eyebrow="Questions" title="Frequently asked questions" />
        <div className="mt-10">
          <Faq
            items={[
              {
                q: "Who can join?",
                a: "Qualified nutritionists and dietitians. You'll upload proof of your qualifications and registration, which our reviewers check before your profile is listed.",
              },
              {
                q: "Does Nutraboom Equals take a share of my fees?",
                a: "No. People see your session fee and contact you through a session request; you arrange the session and payment on your own terms.",
              },
              {
                q: "Is there a cost to be listed?",
                a: "Listing options are shown on the Plan page of your portal. Some may be free, and paid plans can add more visibility.",
              },
              {
                q: "Will you share my clients' chats with me?",
                a: "No. When someone requests a session, you see their name, email and the note they chose to write, never their conversations or plans.",
              },
              {
                q: "Can I offer online sessions?",
                a: "Yes. Choose online, in person, or both, and set your weekly availability in Nigerian time.",
              },
            ]}
          />
        </div>
      </Section>

      <CtaPanel
        id="nutritionists-cta"
        title="Ready to help more people eat well?"
        text={
          open
            ? "Create your profile today and submit it for review."
            : "Applications open soon. Create an account to be ready."
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
