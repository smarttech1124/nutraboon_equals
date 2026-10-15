import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared design-system primitives for the main app and n-equals (ADR-060).
 * They use the tokens in styles/tokens.css only, so both apps stay
 * consistent and dark mode works everywhere.
 */

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-line text-ink hover:bg-subtle",
  danger: "border border-danger/50 text-danger hover:bg-danger-soft",
  ghost: "text-ink hover:bg-subtle",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        BUTTON[variant],
        className,
      )}
    />
  );
}

type LinkVariant = ButtonVariant | "gold" | "light";

const LINK: Record<LinkVariant, string> = {
  ...BUTTON,
  /* Harvest gold with deep-teal text, as on the Nutraboom site. */
  gold: "bg-gold text-[#264653] hover:brightness-95",
  /* For deep-teal panels. */
  light: "border border-deep-ink/40 text-deep-ink hover:bg-white/10",
};

/** A link styled as a button, for calls to action that navigate. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: LinkVariant;
  size?: "md" | "lg";
}) {
  return (
    <Link
      href={href}
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition",
        size === "lg" ? "min-h-12 px-6 text-base" : "min-h-10 px-5 text-sm",
        LINK[variant],
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  hint?: ReactNode;
  error?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cx(
          "min-h-10 w-full rounded-xl border bg-surface px-3 py-2 text-ink placeholder:text-muted",
          error ? "border-danger" : "border-line",
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        {...props}
        className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink"
      >
        {children}
      </select>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cx("rounded-2xl border border-line bg-surface p-5 shadow-sm", className)}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "success" | "error" | "info" | "warning";

const ALERT: Record<Tone, string> = {
  success: "bg-brand-soft text-ink",
  info: "bg-subtle text-ink",
  warning: "bg-subtle text-ink border border-accent/50",
  error: "bg-danger-soft text-danger",
};

/** Errors are announced at once (role="alert"); other messages politely (role="status"). */
export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-lg px-3 py-2 text-sm", ALERT[tone])}
    >
      {children}
    </p>
  );
}

const BADGE: Record<Tone | "neutral", string> = {
  success: "bg-brand text-white",
  info: "bg-brand-soft text-brand-text",
  warning: "bg-subtle text-ink border border-accent/60",
  error: "bg-danger-soft text-danger",
  neutral: "bg-subtle text-ink",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone | "neutral";
  children: ReactNode;
}) {
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", BADGE[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        {...props}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A group of checkboxes sharing one name, in a fieldset with a legend. */
export function CheckboxGroup({
  legend,
  name,
  options,
  selected,
  hint,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
              className="mt-1"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
