import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/next";
import type { AuthUser } from "@/lib/auth/service";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { rolesToNotify } from "./agent";

/**
 * Hospital portal access (ADR-068). Members of a hospital organisation have a
 * role: owner and admin manage the hospital; doctor, nurse and staff work the
 * inbox and appointments of their departments.
 */

export type HospitalRole = "owner" | "admin" | "staff" | "doctor" | "nurse";
export const MANAGER_ROLES: HospitalRole[] = ["owner", "admin"];
export const STAFF_ROLE_LABEL: Record<HospitalRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  doctor: "Doctor",
  nurse: "Nurse",
  staff: "Staff",
};

export type HospitalAccess = {
  user: AuthUser;
  org: { id: string; name: string };
  role: HospitalRole;
  departmentIds: string[];
  status: string;
  manager: boolean;
};

async function membershipOf(userId: string) {
  return getPrisma().membership.findFirst({
    where: { userId, organization: { kind: "hospital" } },
    include: {
      organization: { select: { id: true, name: true, hospital: { select: { status: true } } } },
    },
  });
}

/** For portal pages: signed in, Hospitals on, and a member of a hospital. */
export async function requireHospital(path: string, managerOnly = false): Promise<HospitalAccess> {
  const user = await currentUser("web");
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  if (!(await getEntitlementService().isEnabled("hospitals"))) redirect("/account");
  const m = await membershipOf(user.id);
  if (!m?.organization.hospital) redirect("/hospital/join");
  const role = m.role as HospitalRole;
  const manager = MANAGER_ROLES.includes(role);
  if (managerOnly && !manager) redirect("/hospital");
  return {
    user,
    org: { id: m.organization.id, name: m.organization.name },
    role,
    departmentIds: m.departmentIds,
    status: m.organization.hospital.status,
    manager,
  };
}

export type HospitalActionState = { status: "idle" | "success" | "error"; message: string };

export async function asHospital(
  action: string,
  options: { managerOnly?: boolean },
  run: (access: HospitalAccess) => Promise<HospitalActionState>,
): Promise<HospitalActionState> {
  const user = await currentUser("web");
  if (!user) return { status: "error", message: "Please sign in again." };
  try {
    if (!(await getEntitlementService().isEnabled("hospitals"))) {
      return { status: "error", message: "The hospital portal is not available right now." };
    }
    const m = await membershipOf(user.id);
    if (!m?.organization.hospital)
      return { status: "error", message: "Set up your hospital first." };
    const role = m.role as HospitalRole;
    const manager = MANAGER_ROLES.includes(role);
    if (options.managerOnly && !manager) {
      return { status: "error", message: "Only hospital administrators can do this." };
    }
    return await run({
      user,
      org: { id: m.organization.id, name: m.organization.name },
      role,
      departmentIds: m.departmentIds,
      status: m.organization.hospital.status,
      manager,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "hospital_action_error",
        action,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return {
      status: "error",
      message: "Something went wrong. Nothing was changed; please try again.",
    };
  }
}

/**
 * Notifies the staff who should handle something: members with the wanted
 * roles in the department (or with no department set), else the managers.
 * Text is fixed: never the patient's message or health details.
 */
export async function notifyStaff(
  organizationId: string,
  options: { departmentId: string | null; needsDoctor: boolean; urgent: boolean },
  message: { title: string; body: string; link: string },
): Promise<number> {
  const members = await getPrisma().membership.findMany({
    where: { organizationId },
    select: { userId: true, role: true, departmentIds: true },
  });
  const roles = rolesToNotify(options);
  const inDepartment = (m: { departmentIds: string[] }) =>
    !options.departmentId ||
    m.departmentIds.length === 0 ||
    m.departmentIds.includes(options.departmentId);
  let targets = members.filter((m) => roles.includes(m.role) && inDepartment(m));
  if (targets.length === 0)
    targets = members.filter((m) => MANAGER_ROLES.includes(m.role as HospitalRole));
  for (const t of targets) await notify(t.userId, message);
  return targets.length;
}

/** When a closed conversation is deleted (ADR-068: 90 days after closing). */
export const CONVERSATION_RETENTION_DAYS = 90;
export function deleteAfterFrom(closedAt: Date): Date {
  return new Date(closedAt.getTime() + CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
