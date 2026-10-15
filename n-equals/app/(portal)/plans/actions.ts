"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asAdmin, FAILED, type ActionState } from "@admin/lib/access";
import { recordAudit } from "@/lib/audit";
import { entitlementsFromForm } from "@/lib/billing/entitlements";
import { getPrisma } from "@/lib/db";

/**
 * Subscription plans (ADR-062). Prices are entered in naira and stored in
 * kobo. Each plan names the matching plan at Paystack and/or Flutterwave,
 * created in their dashboards; the amounts must agree.
 */

const optional = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(schema.nullable());

const PlanFields = z.object({
  name: z.string().trim().min(2, "Give the plan a name.").max(80),
  description: z.string().trim().max(300),
  audience: z.enum(["user", "nutritionist", "vendor", "hospital"]),
  interval: z.enum(["monthly", "yearly"]),
  price: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter the price in naira, e.g. 1500 or 1500.50."),
  paystackPlanCode: optional(
    z.string().regex(/^PLN_[A-Za-z0-9]{4,40}$/, "A Paystack plan code looks like PLN_xxxx."),
  ),
  flutterwavePlanId: optional(
    z.string().regex(/^\d{1,12}$/, "A Flutterwave payment plan id is a number."),
  ),
});

const Code = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,39}$/,
    "Use 2–40 lowercase letters, numbers and dashes for the code.",
  );

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readPlan(formData: FormData) {
  const fields = PlanFields.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    audience: text(formData, "audience"),
    interval: text(formData, "interval"),
    price: text(formData, "price"),
    paystackPlanCode: text(formData, "paystackPlanCode"),
    flutterwavePlanId: text(formData, "flutterwavePlanId"),
  });
  if (!fields.success) return { ok: false as const, error: fields.error.issues[0].message };
  const entitlements = entitlementsFromForm(formData);
  if (!entitlements.ok) return { ok: false as const, error: entitlements.error };
  const { price, ...rest } = fields.data;
  return {
    ok: true as const,
    data: {
      ...rest,
      description: rest.description || null,
      priceMinor: Math.round(Number(price) * 100),
      entitlements: entitlements.value,
    },
  };
}

export async function createPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return asAdmin("plans.manage", "plan_create", async (admin) => {
    const code = Code.safeParse(text(formData, "code"));
    if (!code.success) return { status: "error", message: code.error.issues[0].message };
    const plan = readPlan(formData);
    if (!plan.ok) return { status: "error", message: plan.error };
    const prisma = getPrisma();
    if (await prisma.plan.findUnique({ where: { code: code.data } })) {
      return { status: "error", message: "A plan with that code already exists." };
    }
    const created = await prisma.plan.create({ data: { code: code.data, ...plan.data } });
    await recordAudit({
      actorUserId: admin.id,
      action: "plan.created",
      targetType: "plan",
      targetId: created.id,
      metadata: { code: created.code, priceMinor: created.priceMinor },
    });
    revalidatePath("/plans");
    return { status: "success", message: `Plan “${created.name}” created.` };
  });
}

export async function updatePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id");
  if (!id) return FAILED;
  return asAdmin("plans.manage", "plan_update", async (admin) => {
    const plan = readPlan(formData);
    if (!plan.ok) return { status: "error", message: plan.error };
    const updated = await getPrisma().plan.update({ where: { id }, data: plan.data });
    await recordAudit({
      actorUserId: admin.id,
      action: "plan.updated",
      targetType: "plan",
      targetId: id,
      metadata: { code: updated.code, priceMinor: updated.priceMinor },
    });
    revalidatePath("/plans");
    return {
      status: "success",
      message:
        "Saved. Existing subscribers get the new entitlements at once; price changes apply to new checkouts.",
    };
  });
}

export async function setPlanActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = text(formData, "id");
  const active = text(formData, "active") === "true";
  if (!id) return FAILED;
  return asAdmin("plans.manage", "plan_active", async (admin) => {
    await getPrisma().plan.update({ where: { id }, data: { active } });
    await recordAudit({
      actorUserId: admin.id,
      action: active ? "plan.activated" : "plan.retired",
      targetType: "plan",
      targetId: id,
    });
    revalidatePath("/plans");
    return {
      status: "success",
      message: active
        ? "Plan offered again."
        : "Plan retired: no new checkouts. Current subscribers keep it.",
    };
  });
}
