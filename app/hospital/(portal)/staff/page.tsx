import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CheckboxGroup, Field, SelectField } from "@/components/ui";
import { getEntitlementService } from "@/lib/billing";
import { getPrisma } from "@/lib/db";
import { STAFF_ROLE_LABEL, requireHospital, type HospitalRole } from "@/lib/hospitals/server";
import { addStaffAction, removeStaffAction } from "../../actions";

export const metadata: Metadata = { title: "Staff — Hospital portal" };

/** Authorised staff: who is notified for which departments (ADR-068). */
export default async function StaffPage() {
  const { user, org } = await requireHospital("/hospital/staff", true);
  const prisma = getPrisma();
  const [members, departments, entitlements] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: org.id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.hospitalDepartment.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true },
    }),
    getEntitlementService().entitlementsFor({ organizationId: org.id }),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const limit = entitlements["hospital.maxStaff"];

  return (
    <>
      <Card
        title="Staff"
        description={`${members.length} of ${limit} staff accounts your plan allows. Staff with no departments hear about every department.`}
      >
        <ul className="flex flex-col divide-y divide-line text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div>
                <p className="font-semibold text-ink">
                  {m.user.name}{" "}
                  <span className="font-normal text-muted">
                    · {STAFF_ROLE_LABEL[m.role as HospitalRole]}
                  </span>
                </p>
                <p className="text-muted">
                  {m.user.email} ·{" "}
                  {m.departmentIds.length
                    ? m.departmentIds.map((d) => deptName.get(d) ?? "?").join(", ")
                    : "All departments"}
                </p>
              </div>
              {m.role !== "owner" && m.userId !== user.id && (
                <ActionForm
                  action={removeStaffAction.bind(null, m.userId)}
                  submitLabel="Remove"
                  variant="secondary"
                  confirm={`Remove ${m.user.name}?`}
                  className="flex flex-col gap-2"
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
      {members.length < limit && (
        <Card
          title="Add a staff member"
          description="They need a Nutraboom Equals account with this email."
        >
          <ActionForm action={addStaffAction} submitLabel="Add staff member">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="email" name="email" type="email" label="Their account email" required />
              <SelectField id="role" name="role" label="Role" defaultValue="staff">
                <option value="doctor">Doctor</option>
                <option value="nurse">Nurse</option>
                <option value="staff">Staff</option>
                <option value="admin">Administrator (manages the hospital)</option>
              </SelectField>
            </div>
            {departments.length > 0 && (
              <CheckboxGroup
                legend="Departments (leave empty for all)"
                name="departments"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                selected={[]}
              />
            )}
          </ActionForm>
        </Card>
      )}
    </>
  );
}
