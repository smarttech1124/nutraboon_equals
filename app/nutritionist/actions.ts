"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { recordAudit } from "@/lib/audit";
import { allowAttempt, currentUser } from "@/lib/auth/next";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { availabilityFromForm } from "@/lib/nutritionists/availability";
import {
  canEdit,
  missingForSubmission,
  qualificationFormSchema,
  readProfileForm,
} from "@/lib/nutritionists/profile";
import {
  asNutritionist,
  reviewUpdate,
  runQualificationAnalysis,
  type PortalActionState,
} from "@/lib/nutritionists/server";
import { getStorage } from "@/lib/storage/cloudinary";
import { checkUpload, MAX_DOCUMENT_BYTES, MAX_PHOTO_BYTES } from "@/lib/storage/files";

/** Nutritionist portal actions (ADR-064). Each acts on the signed-in user's own profile only. */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const STORAGE_OFF: PortalActionState = {
  status: "error",
  message: "Uploads are not available yet. Please try again later.",
};
const TOO_MANY: PortalActionState = {
  status: "error",
  message: "Too many uploads. Please wait a while and try again.",
};

export async function startProfileAction(): Promise<void> {
  const user = await currentUser("web");
  if (!user) redirect("/sign-in?next=/nutritionist/join");
  if (!(await getEntitlementService().isEnabled("nutritionists"))) redirect("/account");
  await getPrisma().nutritionistProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, specializations: [], expertise: [], sessionTypes: [] },
    update: {},
  });
  await recordAudit({
    actorUserId: user.id,
    action: "nutritionist.profile_started",
    targetType: "nutritionist",
    targetId: user.id,
  });
  redirect("/nutritionist/profile");
}

export async function saveProfileAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("save_profile", async (user, profile) => {
    if (!canEdit(profile.status)) {
      return {
        status: "error",
        message: "Your profile is being reviewed. You can edit it afterwards.",
      };
    }
    const parsed = readProfileForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    const prisma = getPrisma();
    const before = await prisma.nutritionistProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    const v = parsed.value;
    const verifiedFieldsChanged =
      before.title !== v.title ||
      before.yearsExperience !== v.yearsExperience ||
      [...before.specializations].sort().join() !== [...v.specializations].sort().join();
    await prisma.nutritionistProfile.update({
      where: { userId: user.id },
      data: { ...v, ...(verifiedFieldsChanged ? reviewUpdate(profile.status) : {}) },
    });
    revalidatePath("/nutritionist", "layout");
    return {
      status: "success",
      message:
        verifiedFieldsChanged && profile.status === "verified"
          ? "Saved. Your title, specialisations or experience changed, so your profile is back in review and hidden until it is approved."
          : "Profile saved.",
    };
  });
}

export async function saveAvailabilityAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("save_availability", async (user) => {
    const parsed = availabilityFromForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.error };
    await getPrisma().nutritionistProfile.update({
      where: { userId: user.id },
      data: { availability: parsed.value },
    });
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Availability saved." };
  });
}

export async function uploadPhotoAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("upload_photo", async (user) => {
    const storage = getStorage();
    if (!storage) return STORAGE_OFF;
    if (!(await allowAttempt("upload", "web"))) return TOO_MANY;
    const file = await checkUpload(formData.get("photo"), {
      maxBytes: MAX_PHOTO_BYTES,
      allow: ["jpeg", "png"],
    });
    if (!file.ok) return { status: "error", message: file.error };
    const stored = await storage.upload(file.blob, "photo", "nutraboom/nutritionists/photos");
    const prisma = getPrisma();
    const before = await prisma.nutritionistProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { photoPublicId: true },
    });
    await prisma.nutritionistProfile.update({
      where: { userId: user.id },
      data: { photoPublicId: stored.publicId, photoUrl: stored.url },
    });
    if (before.photoPublicId) await storage.destroy(before.photoPublicId, "photo").catch(() => {});
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Photo updated." };
  });
}

export async function addQualificationAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("add_qualification", async (user, profile) => {
    if (!canEdit(profile.status)) {
      return {
        status: "error",
        message: "Your profile is being reviewed. You can edit it afterwards.",
      };
    }
    const parsed = qualificationFormSchema.safeParse({
      kind: field(formData, "kind"),
      title: field(formData, "title"),
      institution: field(formData, "institution"),
      year: field(formData, "year"),
      registrationNumber: field(formData, "registrationNumber"),
      expiresOn: field(formData, "expiresOn"),
    });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
    const prisma = getPrisma();
    if ((await prisma.qualification.count({ where: { profileId: user.id } })) >= 15) {
      return { status: "error", message: "You can list up to 15 qualifications." };
    }
    const { expiresOn, ...rest } = parsed.data;
    await prisma.$transaction([
      prisma.qualification.create({
        data: { ...rest, profileId: user.id, expiresOn: expiresOn ? new Date(expiresOn) : null },
      }),
      prisma.nutritionistProfile.update({
        where: { userId: user.id },
        data: reviewUpdate(profile.status),
      }),
    ]);
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Qualification added." };
  });
}

export async function removeQualificationAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("remove_qualification", async (user, profile) => {
    if (!canEdit(profile.status)) {
      return {
        status: "error",
        message: "Your profile is being reviewed. You can edit it afterwards.",
      };
    }
    const prisma = getPrisma();
    const { count } = await prisma.qualification.deleteMany({
      where: { id: field(formData, "id"), profileId: user.id },
    });
    if (count === 0) return { status: "error", message: "That qualification was not found." };
    await prisma.nutritionistProfile.update({
      where: { userId: user.id },
      data: reviewUpdate(profile.status),
    });
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Qualification removed." };
  });
}

export async function uploadDocumentAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("upload_document", async (user, profile) => {
    if (!canEdit(profile.status)) {
      return {
        status: "error",
        message: "Your profile is being reviewed. You can edit it afterwards.",
      };
    }
    const storage = getStorage();
    if (!storage) return STORAGE_OFF;
    const label = field(formData, "label");
    if (label.length < 2 || label.length > 120) {
      return { status: "error", message: "Say what the document is, e.g. BSc certificate." };
    }
    const prisma = getPrisma();
    if ((await prisma.qualificationDocument.count({ where: { profileId: user.id } })) >= 10) {
      return { status: "error", message: "You can upload up to 10 documents. Remove one first." };
    }
    if (!(await allowAttempt("upload", "web"))) return TOO_MANY;
    const file = await checkUpload(formData.get("document"), {
      maxBytes: MAX_DOCUMENT_BYTES,
      allow: ["pdf", "jpeg", "png"],
    });
    if (!file.ok) return { status: "error", message: file.error };
    const stored = await storage.upload(
      file.blob,
      "document",
      `nutraboom/qualifications/${user.id}`,
    );
    await prisma.$transaction([
      prisma.qualificationDocument.create({
        data: {
          profileId: user.id,
          label,
          publicId: stored.publicId,
          format: stored.format,
          bytes: stored.bytes,
        },
      }),
      prisma.nutritionistProfile.update({
        where: { userId: user.id },
        data: reviewUpdate(profile.status),
      }),
    ]);
    revalidatePath("/nutritionist", "layout");
    return {
      status: "success",
      message: "Document uploaded. Only you and our reviewers can open it.",
    };
  });
}

export async function removeDocumentAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("remove_document", async (user, profile) => {
    if (!canEdit(profile.status)) {
      return {
        status: "error",
        message: "Your profile is being reviewed. You can edit it afterwards.",
      };
    }
    const prisma = getPrisma();
    const doc = await prisma.qualificationDocument.findFirst({
      where: { id: field(formData, "id"), profileId: user.id },
    });
    if (!doc) return { status: "error", message: "That document was not found." };
    await prisma.$transaction([
      prisma.qualificationDocument.delete({ where: { id: doc.id } }),
      prisma.nutritionistProfile.update({
        where: { userId: user.id },
        data: reviewUpdate(profile.status),
      }),
    ]);
    // The database row goes first: a file left in storage is harmless, a row without a file is not.
    await getStorage()
      ?.destroy(doc.publicId, "document")
      .catch(() => {});
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Document removed." };
  });
}

export async function submitForReviewAction(): Promise<PortalActionState> {
  return asNutritionist("submit", async (user, profile) => {
    if (profile.status !== "draft" && profile.status !== "changes_requested") {
      return { status: "error", message: "Your profile has already been submitted." };
    }
    const prisma = getPrisma();
    const p = await prisma.nutritionistProfile.findUniqueOrThrow({
      where: { userId: user.id },
      include: { _count: { select: { qualifications: true, documents: true } } },
    });
    const missing = missingForSubmission({
      ...p,
      qualificationCount: p._count.qualifications,
      documentCount: p._count.documents,
    });
    if (missing.length > 0) return { status: "error", message: missing[0] };
    const { count } = await prisma.nutritionistProfile.updateMany({
      where: { userId: user.id, status: profile.status as "draft" | "changes_requested" },
      data: { status: "submitted", submittedAt: new Date() },
    });
    if (count === 0)
      return { status: "error", message: "Your profile has already been submitted." };
    await recordAudit({
      actorUserId: user.id,
      action: "nutritionist.submitted",
      targetType: "nutritionist",
      targetId: user.id,
    });
    // Assistive only, and slow (an AI call): it runs after the response, and
    // a failure never affects the submission.
    after(() => runQualificationAnalysis(user.id).catch(() => {}));
    revalidatePath("/nutritionist", "layout");
    return {
      status: "success",
      message:
        "Submitted. A reviewer will check your qualifications; we will let you know the outcome.",
    };
  });
}

/** Accept, decline, cancel or complete an appointment the nutritionist owns. */
export async function appointmentAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  return asNutritionist("appointment", async (user) => {
    const prisma = getPrisma();
    const intent = field(formData, "intent");
    const appointment = await prisma.appointment.findFirst({
      where: { id: field(formData, "id"), nutritionistId: user.id },
    });
    if (!appointment) return { status: "error", message: "That appointment was not found." };
    const now = new Date();

    if (intent === "accept" || intent === "decline") {
      if (appointment.status !== "requested") {
        return { status: "error", message: "This request has already been answered." };
      }
      if (intent === "accept") {
        if (appointment.startsAt.getTime() < now.getTime()) {
          return {
            status: "error",
            message: "This request's time has passed. Decline it instead.",
          };
        }
        const end = new Date(appointment.startsAt.getTime() + appointment.minutes * 60_000);
        const clash = await prisma.appointment.findFirst({
          where: {
            nutritionistId: user.id,
            status: "accepted",
            startsAt: { lt: end, gte: new Date(appointment.startsAt.getTime() - 4 * 60 * 60_000) },
          },
          select: { startsAt: true, minutes: true },
        });
        if (
          clash &&
          clash.startsAt.getTime() + clash.minutes * 60_000 > appointment.startsAt.getTime()
        ) {
          return { status: "error", message: "You already accepted another session at that time." };
        }
      }
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: intent === "accept" ? "accepted" : "declined", respondedAt: now },
      });
      await notify(appointment.clientId, {
        title:
          intent === "accept" ? "Your session was accepted" : "Your session request was declined",
        body:
          intent === "accept"
            ? "Your nutritionist accepted your session request. Their contact details are on your account page."
            : "Your nutritionist could not take your session request. You can choose another time or nutritionist.",
        link: "/account",
      });
    } else if (intent === "complete") {
      if (appointment.status !== "accepted") {
        return { status: "error", message: "Only accepted sessions can be marked complete." };
      }
      const recommendation = field(formData, "recommendation").slice(0, 2000) || null;
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "completed", recommendation },
      });
      await notify(appointment.clientId, {
        title: "Your session is complete",
        body: recommendation
          ? "Your nutritionist added a note for you. You can read it on your account page."
          : "Your nutritionist marked your session as complete.",
        link: "/account",
      });
    } else if (intent === "cancel") {
      if (appointment.status !== "accepted" && appointment.status !== "requested") {
        return { status: "error", message: "This appointment cannot be cancelled." };
      }
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "canceled" },
      });
      await notify(appointment.clientId, {
        title: "Your session was cancelled",
        body: "Your nutritionist cancelled your session. You can request another time.",
        link: "/account",
      });
    } else {
      return { status: "error", message: "Unknown action." };
    }
    revalidatePath("/nutritionist", "layout");
    return { status: "success", message: "Appointment updated." };
  });
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await currentUser("web");
  if (!user) return;
  await getPrisma().notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
