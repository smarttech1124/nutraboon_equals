/**
 * Administration roles and what each may do in n-equals (ADR-061). Checked
 * on the server for every admin page and action. Role-to-permission mapping
 * lives here (reviewed in code); assigning roles to people is done in n-equals.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "platform_admin",
  "nutritionist_admin",
  "vendor_admin",
  "hospital_admin",
  "support_admin",
  "finance_admin",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  "users.read",
  "users.manage",
  "users.delete",
  "roles.manage",
  "ai.manage",
  "audio.manage",
  "plans.read",
  "plans.manage",
  "subscriptions.read",
  "subscriptions.manage",
  "payments.read",
  "settings.manage",
  "audit.read",
  "nutritionists.verify",
  "vendors.verify",
  "hospitals.verify",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super administrator",
  platform_admin: "Platform administrator",
  nutritionist_admin: "Nutritionist administrator",
  vendor_admin: "Vendor administrator",
  hospital_admin: "Hospital administrator",
  support_admin: "Support administrator",
  finance_admin: "Finance administrator",
};

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  platform_admin: [
    "users.read",
    "users.manage",
    "users.delete",
    "ai.manage",
    "audio.manage",
    "plans.read",
    "plans.manage",
    "subscriptions.read",
    "settings.manage",
    "audit.read",
  ],
  nutritionist_admin: ["users.read", "nutritionists.verify", "audit.read"],
  vendor_admin: ["users.read", "vendors.verify", "audit.read"],
  hospital_admin: ["users.read", "hospitals.verify", "audit.read"],
  support_admin: ["users.read", "subscriptions.read", "audit.read"],
  finance_admin: [
    "plans.read",
    "plans.manage",
    "subscriptions.read",
    "subscriptions.manage",
    "payments.read",
    "audit.read",
  ],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsOf(roles: readonly AdminRole[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []));
}

export function can(roles: readonly AdminRole[], permission: Permission): boolean {
  return permissionsOf(roles).has(permission);
}
