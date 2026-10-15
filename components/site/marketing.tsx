import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Building blocks for the public pages (ADR-070), after the Nutraboom site:
 * a gold pill eyebrow, a Playfair headline, white rounded cards on cream,
 * and deep-teal call-to-action panels.
 */

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Eyebrow({
  children,
  tone = "gold",
}: {
  children: ReactNode;
  tone?: "gold" | "light";
}) {
  return (
    <p
      className={cx(
        "inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-[0.12em] uppercase",
        tone === "gold" ? "bg-gold-soft text-gold-text" : "bg-white/15 text-deep-ink",
      )}
    >
      {children}
    </p>
  );
}

export function Section({
  id,
  labelledBy,
  tone = "plain",
  children,
  className,
}: {
  id?: string;
  labelledBy: string;
  tone?: "plain" | "tint" | "deep";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx(
        "py-16 sm:py-20",
        tone === "tint" && "bg-subtle",
        tone === "deep" && "bg-deep text-deep-ink",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  align = "center",
  tone = "default",
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "center" | "left";
  tone?: "default" | "light";
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-4",
        align === "center" ? "mx-auto max-w-2xl items-center text-center" : "items-start",
      )}
    >
      {eyebrow && <Eyebrow tone={tone === "light" ? "light" : "gold"}>{eyebrow}</Eyebrow>}
      <h2
        id={id}
        className={cx(
          "font-display text-3xl leading-tight font-bold sm:text-4xl",
          tone === "light" ? "text-deep-ink" : "text-ink",
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cx("text-lg leading-relaxed", tone === "light" ? "opacity-85" : "text-muted")}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

export function IconBadge({ name, tone = "brand" }: { name: IconName; tone?: "brand" | "gold" }) {
  return (
    <span
      className={cx(
        "inline-flex size-12 shrink-0 items-center justify-center rounded-2xl",
        tone === "brand" ? "bg-brand-soft text-brand-text" : "bg-gold-soft text-gold-text",
      )}
    >
      <Icon name={name} className="size-6" />
    </span>
  );
}

/** A white rounded card with an icon, a title and text. */
export function FeatureCard({
  icon,
  title,
  children,
  tone,
  headingLevel = 3,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  tone?: "brand" | "gold";
  headingLevel?: 3 | 4;
}) {
  const H = headingLevel === 3 ? "h3" : "h4";
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-line bg-surface p-6 shadow-[0_10px_30px_-18px_rgba(38,70,83,0.35)]">
      <IconBadge name={icon} tone={tone} />
      <H className="font-display text-xl font-semibold text-ink">{title}</H>
      <div className="leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/** A list with green check marks. */
export function CheckList({
  items,
  tone = "default",
}: {
  items: ReactNode[];
  tone?: "default" | "light";
}) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            className={cx(
              "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full",
              tone === "light" ? "bg-gold text-[#264653]" : "bg-brand text-white",
            )}
          >
            <Icon name="check" className="size-4" />
          </span>
          <span className={tone === "light" ? "opacity-90" : "text-ink"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps, for onboarding explanations. */
export function Steps({ steps }: { steps: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-10 items-center justify-center rounded-full bg-gold font-display text-lg font-bold text-[#264653]"
          >
            {i + 1}
          </span>
          <h3 className="font-semibold text-ink">{s.title}</h3>
          <p className="text-sm leading-relaxed text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Questions and answers, open one at a time with the keyboard or a tap. */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {items.map((item) => (
        <details key={item.q} className="group rounded-2xl border border-line bg-surface px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden="true"
              className="text-xl text-brand-text transition group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="mt-3 leading-relaxed text-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/** A page hero for the inner public pages. */
export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="pt-10 pb-14 sm:pt-16 sm:pb-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            id="page-title"
            className="font-display text-4xl leading-[1.1] font-bold text-ink sm:text-5xl"
          >
            {title}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">{intro}</p>
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** The deep-teal closing call to action. */
export function CtaPanel({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="px-4 py-16 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-white sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-16 size-56 rounded-full bg-gold/30"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-20 -left-10 size-48 rounded-full bg-white/10"
        />
        <div className="relative flex flex-col items-start gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 id={id} className="font-display text-3xl leading-tight font-bold sm:text-4xl">
              {title}
            </h2>
            <p className="mt-3 text-lg leading-relaxed opacity-90">{text}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
