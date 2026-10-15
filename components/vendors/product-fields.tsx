import { CheckboxGroup, Field, SelectField, TextAreaField } from "@/components/ui";
import { STATES } from "@/lib/budget/regions";
import { ALLERGEN_KEYS } from "@/lib/safety/allergens";
import { allergenLabel } from "@/lib/safety/allergy";
import {
  AVAILABILITY_LABEL,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_KEYS,
} from "@/lib/vendors/categories";
import { LABEL_FIELDS, parseLabel, parseLocations } from "@/lib/vendors/product";

export type ProductValues = {
  name: string;
  category: string;
  description: string;
  benefits: string;
  recommendedUse: string;
  ingredients: string[];
  allergens: string[];
  matchTerms: string[];
  labelNutrition: unknown;
  availability: string;
  purchaseLocations: unknown;
  priceNaira: number | null;
};

const SORTED_STATES = [...STATES].sort();
const INPUT = "min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink";

/** The product form's fields, for new and existing products (ADR-067). */
export function ProductFields({ p }: { p?: ProductValues }) {
  const label = parseLabel(p?.labelNutrition);
  const locations = parseLocations(p?.purchaseLocations);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          name="name"
          label="Product name"
          defaultValue={p?.name}
          required
          maxLength={100}
        />
        <SelectField
          id="category"
          name="category"
          label="Category"
          defaultValue={p?.category ?? ""}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {PRODUCT_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {PRODUCT_CATEGORIES[k]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        id="description"
        name="description"
        label="Description"
        maxLength={1200}
        defaultValue={p?.description}
        required
        hint="What it is, how it is made, pack size."
      />
      <TextAreaField
        id="benefits"
        name="benefits"
        label="Nutritional benefits"
        rows={3}
        maxLength={600}
        defaultValue={p?.benefits}
        hint="Describe the food (e.g. 'a source of protein and calcium'). Claims that a food cures, treats or prevents illness are not allowed."
      />
      <TextAreaField
        id="recommendedUse"
        name="recommendedUse"
        label="Recommended use"
        rows={2}
        maxLength={400}
        defaultValue={p?.recommendedUse}
        hint="e.g. 'with breakfast cereal or as a snack'."
      />
      <Field
        id="ingredients"
        name="ingredients"
        label="Ingredients"
        hint="Separate with commas, as on the label."
        defaultValue={p?.ingredients.join(", ")}
        required
      />
      <CheckboxGroup
        legend="Allergens it contains"
        hint="Tick everything on the label. The app also checks the ingredients and adds any it finds."
        name="allergens"
        options={ALLERGEN_KEYS.map((k) => ({ value: k, label: allergenLabel(k) }))}
        selected={p?.allergens ?? []}
      />
      <Field
        id="matchTerms"
        name="matchTerms"
        label="What food is it?"
        hint="Words people and meal plans use for it, separated by commas, e.g. 'yogurt, plain yogurt'. Used to recommend it only where it fits."
        defaultValue={p?.matchTerms.join(", ")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="availability"
          name="availability"
          label="Availability"
          defaultValue={p?.availability ?? "in_stock"}
        >
          {Object.entries(AVAILABILITY_LABEL).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </SelectField>
        <Field
          id="priceNaira"
          name="priceNaira"
          label="Typical price (₦, optional)"
          inputMode="numeric"
          defaultValue={p?.priceNaira != null ? String(p.priceNaira) : ""}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Nutrition label (optional)</legend>
        <p className="text-sm text-muted">
          Copy the values from your product label. They are shown as yours, not verified by
          Nutraboom Equals.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Values are
            <select name="label:basis" defaultValue={label?.basis ?? "100g"} className={INPUT}>
              <option value="100g">per 100 g</option>
              <option value="serving">per serving</option>
            </select>
          </label>
          <Field
            id="label-serving"
            name="label:servingLabel"
            label="Serving size (if per serving)"
            placeholder="e.g. 1 cup (200 ml)"
            defaultValue={label?.servingLabel ?? ""}
          />
          {LABEL_FIELDS.map((f) => (
            <Field
              key={f.key}
              id={`label-${f.key}`}
              name={`label:${f.key}`}
              label={`${f.label} (${f.unit})`}
              inputMode="decimal"
              defaultValue={typeof label?.[f.key] === "number" ? String(label[f.key]) : ""}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Where to buy</legend>
        <p className="text-sm text-muted">
          Shops or online stores that sell it. At least one is needed. Links must start with
          https://.
        </p>
        {Array.from({ length: 5 }, (_, i) => {
          const loc = locations[i];
          return (
            <div
              key={i}
              className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0 sm:grid-cols-5"
            >
              <label className="flex flex-col gap-1 text-sm text-ink">
                Type
                <select
                  name={`loc:${i}:kind`}
                  defaultValue={loc?.kind ?? "store"}
                  className={INPUT}
                >
                  <option value="store">Shop</option>
                  <option value="online">Online</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink">
                Name
                <input name={`loc:${i}:name`} defaultValue={loc?.name ?? ""} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink">
                State
                <select name={`loc:${i}:state`} defaultValue={loc?.state ?? ""} className={INPUT}>
                  <option value="">—</option>
                  {SORTED_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink">
                City
                <input name={`loc:${i}:city`} defaultValue={loc?.city ?? ""} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink">
                Link
                <input
                  name={`loc:${i}:url`}
                  type="url"
                  defaultValue={loc?.url ?? ""}
                  className={INPUT}
                />
              </label>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
