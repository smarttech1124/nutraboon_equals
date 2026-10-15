import type { Metadata } from "next";
import { AvailabilityFields } from "@/components/hospitals/availability-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card, Field, SelectField } from "@/components/ui";
import { getPrisma } from "@/lib/db";
import { requireHospital } from "@/lib/hospitals/server";
import { describeAvailability, parseAvailability } from "@/lib/nutritionists/availability";
import { saveDepartmentAction } from "../../actions";

export const metadata: Metadata = { title: "Departments — Hospital portal" };

function DepartmentFields({
  idPrefix,
  d,
}: {
  idPrefix: string;
  d?: {
    name: string;
    description: string;
    slotMinutes: number;
    capacity: number;
    active: boolean;
    availability: unknown;
  };
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-name`}
          name="name"
          label="Department or service"
          placeholder="e.g. General outpatient"
          defaultValue={d?.name}
          required
          maxLength={80}
        />
        <Field
          id={`${idPrefix}-description`}
          name="description"
          label="Description (optional)"
          defaultValue={d?.description}
          maxLength={400}
        />
        <Field
          id={`${idPrefix}-slot`}
          name="slotMinutes"
          type="number"
          min={10}
          max={240}
          step={5}
          label="Appointment length (minutes)"
          defaultValue={String(d?.slotMinutes ?? 30)}
          required
        />
        <Field
          id={`${idPrefix}-capacity`}
          name="capacity"
          type="number"
          min={1}
          max={50}
          label="Patients per time slot"
          defaultValue={String(d?.capacity ?? 1)}
          required
        />
        <SelectField
          id={`${idPrefix}-active`}
          name="active"
          label="Bookable"
          defaultValue={d?.active === false ? "off" : "on"}
        >
          <option value="on">Yes</option>
          <option value="off">No (hidden from patients)</option>
        </SelectField>
      </div>
      <AvailabilityFields value={d?.availability} />
    </>
  );
}

/** Departments and their bookable opening times (ADR-068). */
export default async function DepartmentsPage() {
  const { org } = await requireHospital("/hospital/departments", true);
  const departments = await getPrisma().hospitalDepartment.findMany({
    where: { organizationId: org.id },
    orderBy: { name: "asc" },
  });

  return (
    <>
      {departments.map((d) => (
        <Card
          key={d.id}
          title={d.name}
          description={
            describeAvailability(parseAvailability(d.availability)).join(", ") ||
            "No opening times yet"
          }
          actions={d.active ? <Badge tone="success">Bookable</Badge> : <Badge>Hidden</Badge>}
        >
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink">Edit</summary>
            <div className="mt-4">
              <ActionForm
                action={saveDepartmentAction.bind(null, d.id)}
                submitLabel="Save department"
              >
                <DepartmentFields idPrefix={`d-${d.id}`} d={d} />
              </ActionForm>
            </div>
          </details>
        </Card>
      ))}
      <Card
        title="Add a department"
        description="Patients book appointments in a department, inside its opening times."
      >
        <ActionForm action={saveDepartmentAction.bind(null, null)} submitLabel="Add department">
          <DepartmentFields idPrefix="new" />
        </ActionForm>
      </Card>
    </>
  );
}
