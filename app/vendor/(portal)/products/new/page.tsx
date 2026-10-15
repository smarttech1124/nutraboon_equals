import type { Metadata } from "next";
import { ProductFields } from "@/components/vendors/product-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Card } from "@/components/ui";
import { requireVendor } from "@/lib/vendors/server";
import { createProductAction } from "../../../actions";

export const metadata: Metadata = { title: "New product — Vendor portal" };

export default async function NewProductPage() {
  await requireVendor("/vendor/products/new");
  return (
    <Card
      title="New product"
      description="Save the product, then add an image and submit it for review."
    >
      <ActionForm action={createProductAction} submitLabel="Save product">
        <ProductFields />
      </ActionForm>
    </Card>
  );
}
