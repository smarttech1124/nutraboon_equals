import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { startHospitalAction } from "../actions";

export const metadata: Metadata = { title: "Register a hospital" };

/** Start of hospital onboarding (ADR-068). */
export default async function JoinPage() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-up?next=/hospital/join");
  if (!(await getEntitlementService().isEnabled("hospitals"))) redirect("/account");
  if (
    await getPrisma().membership.findFirst({
      where: { userId: user.id, organization: { kind: "hospital" } },
    })
  ) {
    redirect("/hospital");
  }
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card title="Register your hospital or clinic">
        <div className="flex flex-col gap-4 text-sm text-ink">
          <p>
            Make your hospital easier to reach for patients who are deaf, hard of hearing, blind,
            speech-impaired or who prefer text: they can find you, book appointments, and message
            your staff through Nutraboom Equals by text or voice.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Add your hospital&apos;s details and pin it on the map.</li>
            <li>Add departments with opening times, and the accessibility services you offer.</li>
            <li>Add your doctors, nurses and staff (they need their own accounts).</li>
            <li>Submit for verification. Only verified hospitals appear to patients.</li>
          </ol>
          <ActionForm action={startHospitalAction} submitLabel="Start registration">
            <Field id="name" name="name" label="Hospital or clinic name" required maxLength={120} />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
