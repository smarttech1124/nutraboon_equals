import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { registerHospitalAction, startHospitalAction } from "../actions";

export const metadata: Metadata = { title: "Register a hospital" };

const STEPS = [
  "Create your account and name your hospital.",
  "Add your hospital's details and pin it on the map.",
  "Add departments with opening times, and the accessibility services you offer.",
  "Add your doctors, nurses and staff by email. Their accounts become active once you're verified.",
  "Submit for verification. Only verified hospitals appear to patients.",
];

/**
 * Hospital onboarding (ADR-068, ADR-089). Someone new registers their account
 * and hospital in one form; someone already signed in only names the
 * hospital. Either way they become its owner and can manage it while it
 * waits for verification.
 */
export default async function JoinPage() {
  const user = await currentUser("web");
  if (
    user &&
    (await getPrisma().membership.findFirst({
      where: { userId: user.id, organization: { kind: "hospital" } },
    }))
  ) {
    redirect("/hospital");
  }
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1.1fr]">
      <section aria-labelledby="why-title" className="flex flex-col gap-4">
        <h1 id="why-title" className="font-display text-3xl font-bold text-ink">
          Join Nutraboom Equals as a partner hospital
        </h1>
        <p className="text-ink">
          Make your hospital easier to reach for patients who are deaf, hard of hearing, blind,
          speech-impaired or who prefer text: they can find you, book appointments, and message your
          staff through Nutraboom Equals by text or voice.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          You can set everything up and manage your account while we verify your hospital.
        </p>
      </section>

      {user ? (
        <Card title="Register your hospital or clinic" description={`Signed in as ${user.email}.`}>
          <ActionForm action={startHospitalAction} submitLabel="Start registration">
            <Field id="name" name="name" label="Hospital or clinic name" required maxLength={120} />
          </ActionForm>
        </Card>
      ) : (
        <Card
          title="Register your hospital or clinic"
          description="Your account will be the hospital's owner account."
        >
          <ActionForm
            action={registerHospitalAction}
            submitLabel="Create account and register"
            pendingLabel="Registering…"
          >
            <Field
              id="hospitalName"
              name="hospitalName"
              label="Hospital or clinic name"
              required
              maxLength={120}
            />
            <Field id="name" name="name" label="Your full name" autoComplete="name" required />
            <Field
              id="email"
              name="email"
              type="email"
              label="Your work email"
              autoComplete="email"
              hint="Use the hospital's email address if you can. We'll send a confirmation link."
              required
            />
            <Field
              id="password"
              name="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              hint="At least 10 characters."
              minLength={10}
              required
            />
          </ActionForm>
          <p className="mt-4 text-sm text-muted">
            Already have an account?{" "}
            <Link
              href="/hospital/sign-in?next=/hospital/join"
              className="text-brand-text underline underline-offset-2"
            >
              Log in first
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}
