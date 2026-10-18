import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field } from "@/components/ui";
import { currentUser } from "@/lib/auth/next";
import { ownedVendorOrgId } from "@/lib/vendors/ownership";
import { startVendorAction } from "../actions";

export const metadata: Metadata = { title: "Become a vendor" };

/** Start of vendor onboarding (ADR-067). */
export default async function JoinPage() {
  const user = await currentUser("web");
  if (!user) redirect("/sign-up?next=/vendor/join");
  if (await ownedVendorOrgId(user.id)) redirect("/vendor");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card title="Sell food products through Nutraboom Equals">
        <div className="flex flex-col gap-4 text-sm text-ink">
          <p>
            Verified food businesses can have their products suggested when they fit what people are
            already planning to eat: in chat, meal plans and shopping lists.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create your business profile.</li>
            <li>Add your products: description, ingredients, allergens, label and where to buy.</li>
            <li>Submit them. A reviewer checks your business and each product.</li>
            <li>Choose a vendor plan to have verified products recommended.</li>
          </ol>
          <p className="text-muted">
            Recommendations are always labelled as sponsored, and never replace nutrition advice.
            Products that claim to cure or treat illness, and breast-milk substitutes, are not
            accepted. Customers buy from you directly.
          </p>
          <ActionForm action={startVendorAction} submitLabel="Create my business profile">
            <Field id="name" name="name" label="Business name" required maxLength={100} />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
