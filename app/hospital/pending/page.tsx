import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { isActiveMember } from "@/lib/hospitals/staff";

export const metadata: Metadata = { title: "Waiting for verification — Hospital portal" };

/**
 * Where hospital staff land while their hospital is not yet verified
 * (ADR-089). Their account exists, but the portal opens only after
 * verification, and nothing about patients is shown or sent to them before.
 */
export default async function PendingPage() {
  const user = await currentUser("web");
  if (!user) redirect("/hospital/sign-in");
  const member = await getPrisma().membership.findFirst({
    where: { userId: user.id, organization: { kind: "hospital" } },
    select: { role: true, activatedAt: true, organization: { select: { name: true } } },
  });
  if (!member) redirect("/hospital/join");
  if (isActiveMember(member)) redirect("/hospital");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card title="Your staff account is waiting for verification">
        <div className="flex flex-col gap-3 text-sm text-ink">
          <p>
            {member.organization.name} has added you as a staff member. We are still verifying the
            hospital, so the portal is not open to staff yet.
          </p>
          <p>
            As soon as the hospital is verified, your account becomes active and we&apos;ll let you
            know by email and in your notifications. You don&apos;t need to do anything else.
          </p>
        </div>
      </Card>
    </div>
  );
}
