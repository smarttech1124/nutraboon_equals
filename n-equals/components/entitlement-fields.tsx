import { Field } from "@/components/ui";
import { ENTITLEMENT_KEYS, ENTITLEMENTS, type Entitlements } from "@/lib/billing/entitlements";

/**
 * One input per entitlement, named "ent:<key>" (read by entitlementsFromForm).
 * A blank number means "not set": the free tier's value applies.
 */
export function EntitlementFields({
  idPrefix,
  values,
  placeholders,
}: {
  idPrefix: string;
  values: Partial<Entitlements>;
  /** Shown in blank number fields, e.g. the free tier's value. */
  placeholders?: Partial<Entitlements>;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-ink">What it includes</legend>
      {ENTITLEMENT_KEYS.map((key) => {
        const spec = ENTITLEMENTS[key];
        const id = `${idPrefix}-${key}`;
        if (spec.kind === "flag") {
          return (
            <label key={key} htmlFor={id} className="flex items-start gap-2 text-sm text-ink">
              <input
                id={id}
                name={`ent:${key}`}
                type="checkbox"
                defaultChecked={values[key] === true}
                className="mt-1"
              />
              <span>
                {spec.label}
                <span className="block text-muted">{spec.description}</span>
              </span>
            </label>
          );
        }
        const value = values[key];
        const placeholder = placeholders?.[key];
        return (
          <Field
            key={key}
            id={id}
            name={`ent:${key}`}
            type="number"
            inputMode="numeric"
            min={spec.min}
            max={spec.max}
            step={1}
            label={spec.label}
            hint={`${spec.description} ${spec.min}–${spec.max}.`}
            defaultValue={typeof value === "number" ? String(value) : ""}
            placeholder={typeof placeholder === "number" ? String(placeholder) : undefined}
          />
        );
      })}
    </fieldset>
  );
}
