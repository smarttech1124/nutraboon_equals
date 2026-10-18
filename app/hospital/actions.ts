"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser, getAuthService, startSession } from "@/lib/auth/next";
import { getEmailSender } from "@/lib/email";
import { verifyEmailMessage } from "@/lib/email/templates";
import { getEntitlementService } from "@/lib/billing";
import { canonicalState } from "@/lib/budget/regions";
import { getPrisma } from "@/lib/db";
import { inNigeria } from "@/lib/geo/distance";
import { geocode } from "@/lib/geo/nominatim";
import { isAccessService } from "@/lib/hospitals/accessibility";
import {
  asHospital,
  deleteAfterFrom,
  type HospitalActionState,
  type HospitalRole,
} from "@/lib/hospitals/server";
import { notify } from "@/lib/notifications";
import { NO_PASSWORD, emailSchema } from "@/lib/auth/service";
import { announceActivation } from "@/lib/hospitals/staff";
import { availabilityFromForm } from "@/lib/nutritionists/availability";

/** Hospital portal actions (ADR-068). Each acts on the member's own hospital only. */

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

const phone = z.string().regex(/^\+?[0-9 ()-]{5,20}$/, "Enter a valid phone number.");

export async function startHospitalAction(
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  const name = field(formData, "name");
  if (name.length < 2 || name.length > 120)
    return { status: "error", message: "Enter the hospital's name." };
  if (
    await getPrisma().membership.findFirst({
      where: { userId: user.id, organization: { kind: "hospital" } },
    })
  ) {
    redirect("/hospital");
  }
  await createHospital(user.id, name);
  redirect("/hospital/profile");
}

/** A new hospital, with this person as its owner (always active, ADR-089). */
async function createHospital(userId: string, name: string): Promise<void> {
  const org = await getPrisma().organization.create({
    data: {
      kind: "hospital",
      name,
      memberships: { create: { userId, role: "owner", activatedAt: new Date() } },
      hospital: { create: { accessibility: [] } },
    },
  });
  await recordAudit({
    actorUserId: userId,
    action: "hospital.started",
    targetType: "hospital",
    targetId: org.id,
  });
}

/**
 * Registration for someone new to Nutraboom Equals (ADR-089): their account
 * and the hospital in one step. They become its owner and can complete the
 * hospital's details, departments and staff while it waits for verification.
 */
export async function registerHospitalAction(
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  if (await currentUser("web")) redirect("/hospital/join");
  if (!(await allowAttempt("signUp", "web"))) {
    return { status: "error", message: "Too many attempts. Please wait and try again." };
  }
  const hospitalName = field(formData, "hospitalName");
  if (hospitalName.length < 2 || hospitalName.length > 120) {
    return { status: "error", message: "Enter the hospital or clinic name." };
  }
  const password =
    typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  try {
    const auth = getAuthService();
    const created = await auth.signUp({
      email: field(formData, "email"),
      name: field(formData, "name"),
      password,
    });
    if (!created.ok) return { status: "error", message: created.error };
    const session = await auth.signIn({ email: created.user.email, password, app: "web" });
    if (!session.ok) throw new Error("sign-in after registration failed");
    await startSession("web", session.token, session.expiresAt);
    await createHospital(created.user.id, hospitalName);
    const sender = getEmailSender();
    if (sender.available) {
      const token = await auth.issueEmailVerification(created.user.id);
      await sender.send({ to: created.user.email, ...verifyEmailMessage(token) }).catch(() => {});
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "hospital_action_error",
        action: "register",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
  redirect("/hospital/profile");
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter the hospital's name.").max(120),
  description: z.string().trim().max(1500),
  address: z.string().trim().min(5, "Enter the street address.").max(200),
  area: z.string().trim().max(80),
  city: z.string().trim().max(80),
  state: z
    .string()
    .transform((s) => canonicalState(s) ?? null)
    .pipe(z.string({ error: "Choose the state." })),
  phone: optional(phone),
  emergencyPhone: optional(phone),
  email: optional(z.email("Enter a valid email.")),
  website: optional(z.url().refine((u) => u.startsWith("https://"), "Use an https:// address.")),
  registrationNumber: optional(z.string().max(40)),
});

export async function saveHospitalProfileAction(
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  return asHospital("save_profile", { managerOnly: true }, async ({ org, status }) => {
    if (status === "submitted") {
      return {
        status: "error",
        message: "Your hospital is being reviewed. You can edit it afterwards.",
      };
    }
    const parsed = profileSchema.safeParse({
      name: field(formData, "name"),
      description: field(formData, "description"),
      address: field(formData, "address"),
      area: field(formData, "area"),
      city: field(formData, "city"),
      state: field(formData, "state"),
      phone: field(formData, "phone"),
      emergencyPhone: field(formData, "emergencyPhone"),
      email: field(formData, "email"),
      website: field(formData, "website"),
      registrationNumber: field(formData, "registrationNumber"),
    });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
    const accessibility = formData
      .getAll("accessibility")
      .filter((v): v is string => typeof v === "string" && isAccessService(v));
    const { name, ...profile } = parsed.data;
    const prisma = getPrisma();
    const before = await prisma.hospitalProfile.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    const reviewed =
      name !== org.name ||
      profile.address !== before.address ||
      profile.registrationNumber !== before.registrationNumber;
    const backToReview = reviewed && status === "verified";
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        name,
        ...(backToReview ? { status: "pending" } : {}),
        hospital: {
          update: {
            ...profile,
            accessibility,
            ...(backToReview ? { status: "submitted", submittedAt: new Date() } : {}),
          },
        },
      },
    });
    revalidatePath("/hospital", "layout");
    return {
      status: "success",
      message: backToReview
        ? "Saved. The name, address or registration changed, so your hospital is back in review."
        : "Hospital details saved.",
    };
  });
}

/** Pins the hospital on the map: from its address (OpenStreetMap) or the device's location. */
export async function setLocationAction(
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  return asHospital("set_location", { managerOnly: true }, async ({ org }) => {
    const prisma = getPrisma();
    const p = await prisma.hospitalProfile.findUniqueOrThrow({ where: { organizationId: org.id } });
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (field(formData, "mode") === "device") {
      latitude = Number(field(formData, "latitude"));
      longitude = Number(field(formData, "longitude"));
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !inNigeria({ latitude, longitude })
      ) {
        return {
          status: "error",
          message: "That location is not in Nigeria. Try finding it from the address.",
        };
      }
    } else {
      const query = [p.address, p.area, p.city, p.state].filter(Boolean).join(", ");
      const place =
        (await geocode(query)) ??
        (await geocode([p.area, p.city, p.state].filter(Boolean).join(", ")));
      if (!place) {
        return {
          status: "error",
          message:
            "We could not find that address on the map. Check it, or use this device's location while at the hospital.",
        };
      }
      latitude = place.latitude;
      longitude = place.longitude;
    }
    await prisma.hospitalProfile.update({
      where: { organizationId: org.id },
      data: { latitude, longitude },
    });
    revalidatePath("/hospital", "layout");
    return { status: "success", message: "Location saved." };
  });
}

export async function submitHospitalAction(): Promise<HospitalActionState> {
  return asHospital("submit", { managerOnly: true }, async ({ user, org, status }) => {
    if (status !== "draft" && status !== "changes_requested") {
      return { status: "error", message: "Your hospital has already been submitted." };
    }
    const prisma = getPrisma();
    const [p, departments] = await Promise.all([
      prisma.hospitalProfile.findUniqueOrThrow({ where: { organizationId: org.id } }),
      prisma.hospitalDepartment.count({ where: { organizationId: org.id, active: true } }),
    ]);
    const missing = [
      p.address.length < 5 && "Add the hospital's address.",
      !p.state && "Choose the state.",
      (p.latitude === null || p.longitude === null) && "Pin the hospital's location on the map.",
      !p.phone && "Add a phone number.",
      departments === 0 && "Add at least one department with opening times.",
    ].filter(Boolean);
    if (missing.length > 0) return { status: "error", message: String(missing[0]) };
    await prisma.hospitalProfile.update({
      where: { organizationId: org.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "hospital.submitted",
      targetType: "hospital",
      targetId: org.id,
    });
    revalidatePath("/hospital", "layout");
    return {
      status: "success",
      message: "Submitted. A reviewer will check your hospital; we will let you know.",
    };
  });
}

const departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter the department's name.").max(80),
  description: z.string().trim().max(400),
  slotMinutes: z.coerce.number().int().min(10, "Slots are at least 10 minutes.").max(240),
  capacity: z.coerce.number().int().min(1).max(50),
});

export async function saveDepartmentAction(
  departmentId: string | null,
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  return asHospital("save_department", { managerOnly: true }, async ({ org }) => {
    const parsed = departmentSchema.safeParse({
      name: field(formData, "name"),
      description: field(formData, "description"),
      slotMinutes: field(formData, "slotMinutes") || "30",
      capacity: field(formData, "capacity") || "1",
    });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
    const availability = availabilityFromForm(formData);
    if (!availability.ok) return { status: "error", message: availability.error };
    const prisma = getPrisma();
    const data = {
      ...parsed.data,
      active: formData.get("active") !== "off",
      availability: availability.value as unknown as Prisma.InputJsonValue,
    };
    if (departmentId) {
      const { count } = await prisma.hospitalDepartment.updateMany({
        where: { id: departmentId, organizationId: org.id },
        data,
      });
      if (count === 0) return { status: "error", message: "That department was not found." };
    } else {
      if ((await prisma.hospitalDepartment.count({ where: { organizationId: org.id } })) >= 40) {
        return { status: "error", message: "You can have up to 40 departments." };
      }
      await prisma.hospitalDepartment.create({ data: { ...data, organizationId: org.id } });
    }
    revalidatePath("/hospital", "layout");
    return { status: "success", message: departmentId ? "Department saved." : "Department added." };
  });
}

const STAFF_ROLES: HospitalRole[] = ["admin", "doctor", "nurse", "staff"];

/**
 * Adds a staff member by email (ADR-089). An existing account is linked; for
 * a new email, an account is made in their name with no password, and they
 * set one themselves from the invitation. Staff added before the hospital is
 * verified stay pending until verification, and only then are told.
 */
export async function addStaffAction(
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  return asHospital("add_staff", { managerOnly: true }, async ({ user, org, status }) => {
    const email = emailSchema.safeParse(field(formData, "email"));
    if (!email.success) return { status: "error", message: "Enter their email address." };
    const role = field(formData, "role") as HospitalRole;
    if (!STAFF_ROLES.includes(role)) return { status: "error", message: "Choose a role." };
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { email: email.data },
      select: { id: true, status: true },
    });
    if (existing?.status === "suspended") {
      return { status: "error", message: "That account is suspended and cannot be added." };
    }
    if (
      existing &&
      (await prisma.membership.findFirst({
        where: { userId: existing.id, organization: { kind: "hospital" } },
      }))
    ) {
      return { status: "error", message: "That person already belongs to a hospital." };
    }
    const name = field(formData, "name");
    if (!existing && (name.length < 2 || name.length > 100)) {
      return {
        status: "error",
        message: "There is no account with that email yet. Add their full name to create one.",
      };
    }
    const limit = (await getEntitlementService().entitlementsFor({ organizationId: org.id }))[
      "hospital.maxStaff"
    ];
    if ((await prisma.membership.count({ where: { organizationId: org.id } })) >= limit) {
      return { status: "error", message: `Your plan allows ${limit} staff accounts.` };
    }
    const departments = await prisma.hospitalDepartment.findMany({
      where: { organizationId: org.id, id: { in: formData.getAll("departments").map(String) } },
      select: { id: true },
    });
    const verified = status === "verified";
    const staffId =
      existing?.id ??
      (
        await prisma.user.create({
          data: { email: email.data, name, passwordHash: NO_PASSWORD },
          select: { id: true },
        })
      ).id;
    await prisma.membership.create({
      data: {
        userId: staffId,
        organizationId: org.id,
        role,
        departmentIds: departments.map((d) => d.id),
        activatedAt: verified ? new Date() : null,
      },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "hospital.staff_added",
      targetType: "hospital",
      targetId: org.id,
      metadata: { userId: staffId, role, newAccount: !existing, pending: !verified },
    });
    if (verified) await announceActivation({ userId: staffId }, org, !existing);
    revalidatePath("/hospital/staff");
    return {
      status: "success",
      message: verified
        ? existing
          ? "Staff member added. They can open the hospital portal now."
          : "Staff member added. We've emailed them how to set their password."
        : "Staff member added. Their account becomes active once your hospital is verified, and we'll tell them then.",
    };
  });
}

export async function removeStaffAction(userId: string): Promise<HospitalActionState> {
  return asHospital("remove_staff", { managerOnly: true }, async ({ user, org }) => {
    if (userId === user.id) return { status: "error", message: "You cannot remove yourself." };
    const prisma = getPrisma();
    const member = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: org.id } },
    });
    if (!member) return { status: "error", message: "That person is not on your staff." };
    if (member.role === "owner")
      return { status: "error", message: "The owner cannot be removed." };
    await prisma.membership.delete({
      where: { userId_organizationId: { userId, organizationId: org.id } },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "hospital.staff_removed",
      targetType: "hospital",
      targetId: org.id,
      metadata: { userId },
    });
    revalidatePath("/hospital/staff");
    return { status: "success", message: "Staff member removed." };
  });
}

export async function appointmentStatusAction(
  appointmentId: string,
  status: "attended" | "no_show" | "canceled",
): Promise<HospitalActionState> {
  return asHospital("appointment_status", {}, async ({ org, manager, departmentIds }) => {
    const prisma = getPrisma();
    const a = await prisma.hospitalAppointment.findFirst({
      where: { id: appointmentId, organizationId: org.id, status: "booked" },
    });
    if (!a) return { status: "error", message: "That appointment cannot be changed." };
    if (!manager && departmentIds.length > 0 && !departmentIds.includes(a.departmentId)) {
      return { status: "error", message: "That appointment is in another department." };
    }
    await prisma.hospitalAppointment.update({ where: { id: a.id }, data: { status } });
    if (status === "canceled") {
      await notify(a.patientId, {
        title: `Your appointment at ${org.name} was cancelled`,
        body: "The hospital cancelled your appointment. You can book another time.",
        link: "/account",
      });
    }
    revalidatePath("/hospital/appointments");
    return { status: "success", message: "Appointment updated." };
  });
}

/** Staff reply in an accessibility conversation. */
export async function staffReplyAction(
  conversationId: string,
  _prev: HospitalActionState,
  formData: FormData,
): Promise<HospitalActionState> {
  return asHospital("staff_reply", {}, async ({ user, org }) => {
    const text = field(formData, "text").slice(0, 2000);
    if (!text) return { status: "error", message: "Type a reply first." };
    const prisma = getPrisma();
    const c = await prisma.accessConversation.findFirst({
      where: { id: conversationId, organizationId: org.id, status: { not: "closed" } },
    });
    if (!c) return { status: "error", message: "This conversation is closed." };
    await prisma.$transaction([
      prisma.accessMessage.create({
        data: { conversationId: c.id, sender: "staff", senderUserId: user.id, text },
      }),
      prisma.accessConversation.update({
        where: { id: c.id },
        data: { assignedUserId: c.assignedUserId ?? user.id },
      }),
    ]);
    await notify(c.patientId, {
      title: `New reply from ${org.name}`,
      body: "A staff member replied to your message. Open it in Nutraboom Equals.",
      link: `/hospitals/messages/${c.id}`,
    });
    revalidatePath(`/hospital/inbox/${c.id}`);
    return { status: "success", message: "Reply sent." };
  });
}

/** A doctor or staff member takes the conversation, so colleagues know it is handled. */
export async function claimConversationAction(
  conversationId: string,
): Promise<HospitalActionState> {
  return asHospital("claim", {}, async ({ user, org }) => {
    const { count } = await getPrisma().accessConversation.updateMany({
      where: {
        id: conversationId,
        organizationId: org.id,
        assignedUserId: null,
        status: { not: "closed" },
      },
      data: { assignedUserId: user.id },
    });
    revalidatePath(`/hospital/inbox/${conversationId}`);
    return count > 0
      ? { status: "success", message: "You are handling this conversation." }
      : { status: "error", message: "Someone is already handling it." };
  });
}

export async function closeConversationAction(
  conversationId: string,
): Promise<HospitalActionState> {
  return asHospital("close", {}, async ({ org }) => {
    const now = new Date();
    const { count } = await getPrisma().accessConversation.updateMany({
      where: { id: conversationId, organizationId: org.id, status: { not: "closed" } },
      data: { status: "closed", closedAt: now, deleteAfter: deleteAfterFrom(now) },
    });
    revalidatePath(`/hospital/inbox/${conversationId}`);
    return count > 0
      ? { status: "success", message: "Closed. It will be deleted in 90 days." }
      : { status: "error", message: "Already closed." };
  });
}
