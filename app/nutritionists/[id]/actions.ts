"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser } from "@/lib/auth/next";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  fitsAvailability,
  fromLagosLocal,
  parseAvailability,
} from "@/lib/nutritionists/availability";
import { listedNutritionist } from "@/lib/nutritionists/directory";

/** Session requests from the public profile page (ADR-064). No payment passes through Equals. */

export type BookingState = { status: "idle" | "success" | "error"; message: string };

const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestAppointmentAction(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in to request a session." };
  const nutritionistId = field(formData, "nutritionistId");
  if (nutritionistId === user.id) {
    return { status: "error", message: "You cannot book a session with yourself." };
  }
  if (formData.get("consent") !== "on") {
    return {
      status: "error",
      message: "Please agree to share your name, email and note with the nutritionist.",
    };
  }
  if (!(await allowAttempt("booking", "web"))) {
    return { status: "error", message: "Too many requests. Please wait a while and try again." };
  }
  try {
    const card = await listedNutritionist(nutritionistId);
    if (!card)
      return { status: "error", message: "This nutritionist is not taking requests right now." };
    const sessionType = field(formData, "sessionType");
    if (sessionType !== "online" && sessionType !== "in_person") {
      return { status: "error", message: "Choose a session type." };
    }
    if (!card.sessionTypes.includes(sessionType)) {
      return { status: "error", message: "This nutritionist does not offer that session type." };
    }
    const startsAt = fromLagosLocal(field(formData, "startsAt"));
    if (!startsAt) return { status: "error", message: "Choose a date and time." };
    const now = Date.now();
    if (startsAt.getTime() < now + MIN_NOTICE_MS) {
      return { status: "error", message: "Choose a time at least 2 hours from now." };
    }
    if (startsAt.getTime() > now + MAX_AHEAD_MS) {
      return { status: "error", message: "Choose a time within the next 60 days." };
    }
    const prisma = getPrisma();
    const profile = await prisma.nutritionistProfile.findUniqueOrThrow({
      where: { userId: nutritionistId },
      select: { availability: true },
    });
    if (!fitsAvailability(parseAvailability(profile.availability), startsAt, card.sessionMinutes)) {
      return {
        status: "error",
        message: `That time is outside their hours. They are available ${card.availability.join(", ")} (Nigerian time).`,
      };
    }
    const open = await prisma.appointment.count({
      where: { nutritionistId, clientId: user.id, status: { in: ["requested", "accepted"] } },
    });
    if (open >= 3) {
      return {
        status: "error",
        message: "You already have 3 open requests with this nutritionist.",
      };
    }
    const note = field(formData, "note").slice(0, 500) || null;
    const appointment = await prisma.appointment.create({
      data: {
        nutritionistId,
        clientId: user.id,
        sessionType,
        startsAt,
        minutes: card.sessionMinutes,
        feeMinor: card.sessionFeeMinor,
        clientNote: note,
      },
    });
    await recordAudit({
      actorUserId: user.id,
      action: "appointment.requested",
      targetType: "appointment",
      targetId: appointment.id,
    });
    await notify(nutritionistId, {
      title: "New session request",
      body: "Someone has requested a session with you. Review it in your nutritionist portal.",
      link: "/nutritionist/appointments",
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "booking_error",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  }
  revalidatePath("/account");
  return {
    status: "success",
    message:
      "Request sent. You will be told when the nutritionist accepts it; see your account page.",
  };
}

/** The client cancels their own request or accepted session. */
export async function cancelMyAppointmentAction(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  const prisma = getPrisma();
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: field(formData, "id"),
      clientId: user.id,
      status: { in: ["requested", "accepted"] },
    },
  });
  if (!appointment) return { status: "error", message: "That session cannot be cancelled." };
  await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "canceled" } });
  await notify(appointment.nutritionistId, {
    title: "A session was cancelled",
    body: "A client cancelled a session request. See your nutritionist portal.",
    link: "/nutritionist/appointments",
  });
  revalidatePath("/account");
  return { status: "success", message: "Session cancelled." };
}
