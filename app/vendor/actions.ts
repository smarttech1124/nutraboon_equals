"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { canonicalState } from "@/lib/budget/regions";
import { getPrisma } from "@/lib/db";
import { getStorage } from "@/lib/storage/cloudinary";
import { checkUpload, MAX_PHOTO_BYTES } from "@/lib/storage/files";
import { isProductCategory } from "@/lib/vendors/categories";
import { ownedVendorOrgId } from "@/lib/vendors/ownership";
import { productProblems, readProductForm } from "@/lib/vendors/product";
import { asVendor, backToReview, type VendorActionState } from "@/lib/vendors/server";

/** Vendor portal actions (ADR-067). Each acts on the signed-in owner's own business only. */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const optional = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(schema.nullable());

export async function startVendorAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  if (!(await getEntitlementService().isEnabled("vendors"))) {
    return { status: "error", message: "The vendor portal is not available right now." };
  }
  const name = field(formData, "name");
  if (name.length < 2 || name.length > 100) {
    return { status: "error", message: "Enter your business name." };
  }
  if (await ownedVendorOrgId(user.id)) redirect("/vendor");
  const prisma = getPrisma();
  const org = await prisma.organization.create({
    data: {
      kind: "vendor",
      name,
      memberships: { create: { userId: user.id, role: "owner" } },
      vendor: { create: { categories: [] } },
    },
  });
  await recordAudit({
    actorUserId: user.id,
    action: "vendor.started",
    targetType: "vendor",
    targetId: org.id,
  });
  redirect("/vendor/business");
}

const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name.").max(100),
  description: z.string().trim().max(1200),
  categories: z.array(z.string()).transform((c) => [...new Set(c.filter(isProductCategory))]),
  website: optional(
    z
      .url("Enter a full website address.")
      .refine((u) => u.startsWith("https://"), "Use an https:// address."),
  ),
  contactEmail: optional(z.email("Enter a valid email.")),
  contactPhone: optional(z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")),
  state: z.string().transform((s) => canonicalState(s) ?? null),
  city: z.string().trim().max(60),
  registrationNumber: optional(z.string().max(30)),
});

export async function saveBusinessAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return asVendor("save_business", async ({ org, status }) => {
    if (status === "submitted") {
      return {
        status: "error",
        message: "Your business is being reviewed. You can edit it afterwards.",
      };
    }
    const parsed = businessSchema.safeParse({
      name: field(formData, "name"),
      description: field(formData, "description"),
      categories: formData.getAll("categories").filter((v): v is string => typeof v === "string"),
      website: field(formData, "website"),
      contactEmail: field(formData, "contactEmail"),
      contactPhone: field(formData, "contactPhone"),
      state: field(formData, "state"),
      city: field(formData, "city"),
      registrationNumber: field(formData, "registrationNumber"),
    });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
    const { name, ...profile } = parsed.data;
    const prisma = getPrisma();
    const before = await prisma.vendorProfile.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    const reviewed =
      name !== org.name ||
      profile.registrationNumber !== before.registrationNumber ||
      [...profile.categories].sort().join() !== [...before.categories].sort().join();
    const review = reviewed ? backToReview(status) : {};
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        name,
        ...(reviewed && status === "verified" ? { status: "pending" } : {}),
        vendor: { update: { ...profile, ...review } },
      },
    });
    revalidatePath("/vendor", "layout");
    return {
      status: "success",
      message:
        reviewed && status === "verified"
          ? "Saved. Your name, registration or categories changed, so your business is back in review."
          : "Business profile saved.",
    };
  });
}

export async function uploadLogoAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return asVendor("upload_logo", async ({ org }) => {
    const storage = getStorage();
    if (!storage) return { status: "error", message: "Uploads are not available yet." };
    if (!(await allowAttempt("upload", "web"))) {
      return { status: "error", message: "Too many uploads. Please wait and try again." };
    }
    const file = await checkUpload(formData.get("logo"), {
      maxBytes: MAX_PHOTO_BYTES,
      allow: ["jpeg", "png"],
    });
    if (!file.ok) return { status: "error", message: file.error };
    const stored = await storage.upload(file.blob, "photo", "nutraboom/vendors/logos");
    const prisma = getPrisma();
    const before = await prisma.vendorProfile.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    await prisma.vendorProfile.update({
      where: { organizationId: org.id },
      data: { logoPublicId: stored.publicId, logoUrl: stored.url },
    });
    if (before.logoPublicId) await storage.destroy(before.logoPublicId, "photo").catch(() => {});
    revalidatePath("/vendor", "layout");
    return { status: "success", message: "Logo updated." };
  });
}

export async function submitBusinessAction(): Promise<VendorActionState> {
  return asVendor("submit_business", async ({ user, org, status }) => {
    if (status !== "draft" && status !== "changes_requested") {
      return { status: "error", message: "Your business has already been submitted." };
    }
    const p = await getPrisma().vendorProfile.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    const missing = [
      p.description.trim().length < 20 && "Describe your business in a few sentences.",
      p.categories.length === 0 && "Choose at least one category.",
      !p.state && "Choose your state.",
      !p.contactEmail && !p.contactPhone && "Add a contact email or phone number.",
    ].filter(Boolean);
    if (missing.length > 0) return { status: "error", message: String(missing[0]) };
    await getPrisma().vendorProfile.update({
      where: { organizationId: org.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "vendor.submitted",
      targetType: "vendor",
      targetId: org.id,
    });
    revalidatePath("/vendor", "layout");
    return {
      status: "success",
      message: "Submitted. A reviewer will check your business; we will let you know.",
    };
  });
}

export async function createProductAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  let productId: string | undefined;
  const result = await asVendor("create_product", async ({ org }) => {
    const parsed = readProductForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    const prisma = getPrisma();
    const limit = (await getEntitlementService().entitlementsFor({ organizationId: org.id }))[
      "vendor.maxProducts"
    ];
    if ((await prisma.product.count({ where: { organizationId: org.id } })) >= limit) {
      return {
        status: "error",
        message: `Your plan allows ${limit} product${limit === 1 ? "" : "s"}. Remove one or choose a larger plan.`,
      };
    }
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        ...parsed.value,
        labelNutrition: (parsed.value.labelNutrition ?? undefined) as
          Prisma.InputJsonValue | undefined,
        purchaseLocations: parsed.value.purchaseLocations as unknown as Prisma.InputJsonValue,
      },
    });
    productId = product.id;
    return { status: "success", message: "Product saved." };
  });
  if (productId) redirect(`/vendor/products/${productId}`);
  return result;
}

async function ownedProduct(orgId: string, id: string) {
  return getPrisma().product.findFirst({ where: { id, organizationId: orgId } });
}

export async function updateProductAction(
  productId: string,
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return asVendor("update_product", async ({ org }) => {
    const product = await ownedProduct(org.id, productId);
    if (!product) return { status: "error", message: "That product was not found." };
    if (product.status === "submitted") {
      return {
        status: "error",
        message: "This product is being reviewed. You can edit it afterwards.",
      };
    }
    if (product.status === "suspended" || product.status === "rejected") {
      return { status: "error", message: "This product cannot be changed." };
    }
    const parsed = readProductForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    await getPrisma().product.update({
      where: { id: product.id },
      data: {
        ...parsed.value,
        labelNutrition: (parsed.value.labelNutrition ?? null) as Prisma.InputJsonValue,
        purchaseLocations: parsed.value.purchaseLocations as unknown as Prisma.InputJsonValue,
        ...backToReview(product.status),
      },
    });
    revalidatePath("/vendor", "layout");
    return {
      status: "success",
      message:
        product.status === "verified"
          ? "Saved. The product is back in review and hidden until it is approved."
          : "Product saved.",
    };
  });
}

export async function uploadProductImageAction(
  productId: string,
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return asVendor("product_image", async ({ org }) => {
    const product = await ownedProduct(org.id, productId);
    if (!product) return { status: "error", message: "That product was not found." };
    if (product.status === "submitted") {
      return {
        status: "error",
        message: "This product is being reviewed. You can edit it afterwards.",
      };
    }
    const storage = getStorage();
    if (!storage) return { status: "error", message: "Uploads are not available yet." };
    if (!(await allowAttempt("upload", "web"))) {
      return { status: "error", message: "Too many uploads. Please wait and try again." };
    }
    const file = await checkUpload(formData.get("image"), {
      maxBytes: MAX_PHOTO_BYTES,
      allow: ["jpeg", "png"],
    });
    if (!file.ok) return { status: "error", message: file.error };
    const stored = await storage.upload(file.blob, "photo", "nutraboom/vendors/products");
    await getPrisma().product.update({
      where: { id: product.id },
      data: {
        imagePublicId: stored.publicId,
        imageUrl: stored.url,
        ...backToReview(product.status),
      },
    });
    if (product.imagePublicId)
      await storage.destroy(product.imagePublicId, "photo").catch(() => {});
    revalidatePath("/vendor", "layout");
    return { status: "success", message: "Image updated." };
  });
}

export async function submitProductAction(productId: string): Promise<VendorActionState> {
  return asVendor("submit_product", async ({ user, org }) => {
    const product = await ownedProduct(org.id, productId);
    if (!product) return { status: "error", message: "That product was not found." };
    if (product.status !== "draft" && product.status !== "changes_requested") {
      return { status: "error", message: "This product has already been submitted." };
    }
    const problems = productProblems(product);
    if (problems.length > 0) return { status: "error", message: problems[0] };
    await getPrisma().product.update({
      where: { id: product.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "product.submitted",
      targetType: "product",
      targetId: product.id,
    });
    revalidatePath("/vendor", "layout");
    return { status: "success", message: "Submitted for review." };
  });
}

export async function deleteProductAction(productId: string): Promise<void> {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/vendor/products");
  const orgId = await ownedVendorOrgId(user.id);
  const prisma = getPrisma();
  const product = orgId ? await ownedProduct(orgId, productId) : null;
  if (product) {
    await prisma.product.delete({ where: { id: product.id } });
    if (product.imagePublicId)
      await getStorage()
        ?.destroy(product.imagePublicId, "photo")
        .catch(() => {});
    await recordAudit({
      actorUserId: user.id,
      action: "product.deleted",
      targetType: "product",
      targetId: product.id,
    });
  }
  redirect("/vendor/products");
}
