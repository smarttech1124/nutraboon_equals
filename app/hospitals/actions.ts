"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/lib/generated/prisma/client";
import { getStructuredProvider } from "@/lib/ai/settings/runtime";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { isNeed } from "@/lib/hospitals/accessibility";
import { routeMessage, type Routing } from "@/lib/hospitals/agent";
import { isListedHospital } from "@/lib/hospitals/directory";
import { deleteAfterFrom, notifyStaff } from "@/lib/hospitals/server";
import { slotsForDay } from "@/lib/hospitals/slots";
import { notify } from "@/lib/notifications";

/** Patient actions for hospitals (ADR-068): booking and the accessibility conversation. */

export type PatientActionState = { status: "idle" | "success" | "error"; message: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

export async function bookAppointmentAction(
  hospitalId: string,
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in to book." };
  if (formData.get("consent") !== "on") {
    return {
      status: "error",
      message: "Please agree to share your name, email and needs with the hospital.",
    };
  }
  if (!(await allowAttempt("booking", "web"))) {
    return { status: "error", message: "Too many requests. Please wait a while and try again." };
  }
  try {
    if (!(await isListedHospital(hospitalId))) {
      return { status: "error", message: "This hospital is not taking bookings right now." };
    }
    const prisma = getPrisma();
    const department = await prisma.hospitalDepartment.findFirst({
      where: { id: field(formData, "departmentId"), organizationId: hospitalId, active: true },
    });
    if (!department) return { status: "error", message: "Choose a department." };
    const startsAt = new Date(field(formData, "startsAt"));
    if (Number.isNaN(startsAt.getTime())) return { status: "error", message: "Choose a time." };
    const needs = formData
      .getAll("needs")
      .filter((v): v is string => typeof v === "string" && isNeed(v));
    const note = field(formData, "note").slice(0, 500) || null;
    const open = await prisma.hospitalAppointment.count({
      where: {
        patientId: user.id,
        organizationId: hospitalId,
        status: "booked",
        startsAt: { gte: new Date() },
      },
    });
    if (open >= 3)
      return {
        status: "error",
        message: "You already have 3 upcoming appointments at this hospital.",
      };

    // Checked and created together, so two people cannot take the last place.
    const created = await prisma.$transaction(
      async (tx) => {
        const booked = await tx.hospitalAppointment.findMany({
          where: { departmentId: department.id, status: "booked", startsAt },
          select: { startsAt: true },
        });
        const free = slotsForDay(
          startsAt,
          department.availability,
          department.slotMinutes,
          department.capacity,
          booked.map((b) => b.startsAt),
          new Date(),
        ).some((s) => s.getTime() === startsAt.getTime());
        if (!free) return null;
        return tx.hospitalAppointment.create({
          data: {
            organizationId: hospitalId,
            departmentId: department.id,
            patientId: user.id,
            startsAt,
            minutes: department.slotMinutes,
            needs,
            note,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!created)
      return { status: "error", message: "That time has just been taken. Please choose another." };
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { name: true },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "hospital_appointment.booked",
      targetType: "hospital_appointment",
      targetId: created.id,
    });
    await notify(user.id, {
      title: `Appointment booked at ${org.name}`,
      body: `${department.name}, ${when.format(startsAt)}. You will get a reminder before it.`,
      link: "/account",
    });
    await notifyStaff(
      hospitalId,
      { departmentId: department.id, needsDoctor: false, urgent: false },
      {
        title: "New appointment",
        body: `A patient booked ${department.name} for ${when.format(startsAt)}.`,
        link: "/hospital/appointments",
      },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "hospital_booking_error",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
  revalidatePath("/account");
  return {
    status: "success",
    message: "Booked. It is on your account page. You can also message the hospital below.",
  };
}

export async function cancelHospitalAppointmentAction(
  appointmentId: string,
): Promise<PatientActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  const prisma = getPrisma();
  const a = await prisma.hospitalAppointment.findFirst({
    where: { id: appointmentId, patientId: user.id, status: "booked" },
    include: { department: { select: { name: true } } },
  });
  if (!a) return { status: "error", message: "That appointment cannot be cancelled." };
  await prisma.hospitalAppointment.update({ where: { id: a.id }, data: { status: "canceled" } });
  await notifyStaff(
    a.organizationId,
    { departmentId: a.departmentId, needsDoctor: false, urgent: false },
    {
      title: "Appointment cancelled",
      body: `A patient cancelled ${a.department.name} for ${when.format(a.startsAt)}.`,
      link: "/hospital/appointments",
    },
  );
  revalidatePath("/account");
  return { status: "success", message: "Appointment cancelled." };
}

async function route(organizationId: string, text: string): Promise<Routing> {
  const departments = await getPrisma().hospitalDepartment.findMany({
    where: { organizationId, active: true },
    select: { id: true, name: true },
  });
  let provider = null;
  try {
    provider = await getStructuredProvider();
  } catch {
    provider = null;
  }
  return routeMessage(text, departments, provider);
}

async function alertStaff(organizationId: string, conversationId: string, routing: Routing) {
  await notifyStaff(
    organizationId,
    {
      departmentId: routing.departmentId,
      needsDoctor: routing.needsDoctor,
      urgent: routing.urgent,
    },
    {
      title: routing.urgent
        ? "Urgent: a patient may need care now"
        : routing.needsDoctor
          ? "A patient message needs a doctor"
          : "New patient message",
      body: "A patient wrote through the Nutraboom Equals accessibility service. Open it in the hospital portal.",
      link: `/hospital/inbox/${conversationId}`,
    },
  );
}

/** Starts a conversation with the hospital; the agent replies and alerts staff. */
export async function startConversationAction(
  hospitalId: string,
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in to message the hospital." };
  const text = field(formData, "text").slice(0, 2000);
  if (!text) return { status: "error", message: "Type or say your message first." };
  if (!(await allowAttempt("booking", "web"))) {
    return { status: "error", message: "Too many messages. Please wait a while and try again." };
  }
  let conversationId: string;
  try {
    if (!(await isListedHospital(hospitalId))) {
      return { status: "error", message: "This hospital is not available right now." };
    }
    const prisma = getPrisma();
    const appointmentId = field(formData, "appointmentId") || null;
    const appointment = appointmentId
      ? await prisma.hospitalAppointment.findFirst({
          where: {
            id: appointmentId,
            patientId: user.id,
            organizationId: hospitalId,
            conversation: null,
          },
          select: { id: true },
        })
      : null;
    const routing = await route(hospitalId, text);
    const c = await prisma.accessConversation.create({
      data: {
        organizationId: hospitalId,
        patientId: user.id,
        appointmentId: appointment?.id ?? null,
        status: routing.urgent || routing.needsDoctor ? "escalated" : "open",
        category: routing.category,
        departmentId: routing.departmentId,
        summary: routing.summary,
        needsDoctor: routing.needsDoctor,
        urgent: routing.urgent,
        messages: {
          create: [
            {
              sender: "patient",
              senderUserId: user.id,
              text,
              inputMode: field(formData, "inputMode") === "voice" ? "voice" : "text",
            },
            { sender: "agent", text: routing.reply },
          ],
        },
      },
    });
    conversationId = c.id;
    await alertStaff(hospitalId, c.id, routing);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "access_conversation_error",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { status: "error", message: "Your message could not be sent. Please try again." };
  }
  redirect(`/hospitals/messages/${conversationId}`);
}

/** A follow-up from the patient. The agent steps in again only if it becomes urgent. */
export async function patientMessageAction(
  conversationId: string,
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  const text = field(formData, "text").slice(0, 2000);
  if (!text) return { status: "error", message: "Type or say your message first." };
  const prisma = getPrisma();
  const c = await prisma.accessConversation.findFirst({
    where: { id: conversationId, patientId: user.id, status: { not: "closed" } },
  });
  if (!c)
    return {
      status: "error",
      message: "This conversation is closed. Start a new one from the hospital's page.",
    };
  const routing = await route(c.organizationId, text);
  const becameUrgent = routing.urgent && !c.urgent;
  await prisma.$transaction([
    prisma.accessMessage.create({
      data: {
        conversationId: c.id,
        sender: "patient",
        senderUserId: user.id,
        text,
        inputMode: field(formData, "inputMode") === "voice" ? "voice" : "text",
      },
    }),
    ...(becameUrgent
      ? [
          prisma.accessMessage.create({
            data: { conversationId: c.id, sender: "agent", text: routing.reply },
          }),
        ]
      : []),
    prisma.accessConversation.update({
      where: { id: c.id },
      data: {
        // Staff see what the latest message is about; a rules-only routing keeps the last summary.
        ...(routing.source === "ai" || routing.urgent ? { summary: routing.summary } : {}),
        ...(!c.departmentId && routing.departmentId ? { departmentId: routing.departmentId } : {}),
        ...(routing.urgent ? { urgent: true, status: "escalated", category: "urgent" } : {}),
        ...(routing.needsDoctor && !c.needsDoctor
          ? { needsDoctor: true, status: "escalated" }
          : {}),
      },
    }),
  ]);
  if (becameUrgent || !c.assignedUserId) {
    await alertStaff(c.organizationId, c.id, {
      ...routing,
      departmentId: c.departmentId ?? routing.departmentId,
    });
  } else {
    await notify(c.assignedUserId, {
      title: "New patient message",
      body: "A patient you are helping wrote again. Open it in the hospital portal.",
      link: `/hospital/inbox/${c.id}`,
    });
  }
  revalidatePath(`/hospitals/messages/${c.id}`);
  return { status: "success", message: "Sent." };
}

/** Patients can delete their conversations at any time. */
export async function deleteConversationAction(conversationId: string): Promise<void> {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/account");
  await getPrisma().accessConversation.deleteMany({
    where: { id: conversationId, patientId: user.id },
  });
  redirect("/account");
}

export async function closeMyConversationAction(
  conversationId: string,
): Promise<PatientActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  const now = new Date();
  await getPrisma().accessConversation.updateMany({
    where: { id: conversationId, patientId: user.id, status: { not: "closed" } },
    data: { status: "closed", closedAt: now, deleteAfter: deleteAfterFrom(now) },
  });
  revalidatePath(`/hospitals/messages/${conversationId}`);
  return { status: "success", message: "Closed. It will be deleted in 90 days." };
}
