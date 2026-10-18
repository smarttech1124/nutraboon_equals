import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { startProfileAction } from "../actions";

export const metadata: Metadata = { title: "Join as a nutritionist" };

/** Start of nutritionist onboarding (ADR-064). */
export default async function JoinPage() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-up?next=/nutritionist/join");
  const existing = await getPrisma().nutritionistProfile.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });
  if (existing) redirect("/nutritionist");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card title="Join as a nutritionist">
        <div className="flex flex-col gap-4 text-sm text-ink">
          <p>
            Qualified nutritionists and dietitians can be suggested to people using Nutraboom Equals
            who would benefit from professional advice.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create your professional profile: specialisations, location, fee and contact.</li>
            <li>Add your qualifications and upload your certificates or licence.</li>
            <li>Set the times you are available each week.</li>
            <li>Submit your profile. A reviewer checks it before it appears to anyone.</li>
          </ol>
          <p className="text-muted">
            Clients pay you directly, on your own terms. Nutraboom Equals shows your session fee and
            contact details; it does not take payments for sessions.
          </p>
          <form action={startProfileAction}>
            <Button type="submit">Start my profile</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
