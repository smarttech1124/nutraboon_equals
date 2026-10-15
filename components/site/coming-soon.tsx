import { ButtonLink } from "@/components/ui";
import { Icon, type IconName } from "./icons";

/**
 * Shown in place of a directory whose feature is switched off in n-equals
 * (ADR-070), so links in the site navigation never lead to a "not found"
 * page while a module is being prepared.
 */
export function ComingSoon({
  icon,
  title,
  text,
  partnerHref,
  partnerLabel,
}: {
  icon: IconName;
  title: string;
  text: string;
  partnerHref?: string;
  partnerLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-12 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-3xl bg-gold-soft text-gold-text">
        <Icon name={icon} className="size-8" />
      </span>
      <p className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold tracking-[0.12em] text-gold-text uppercase">
        Coming soon
      </p>
      <h1 className="font-display text-4xl font-bold text-ink">{title}</h1>
      <p className="text-lg leading-relaxed text-muted">{text}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" size="lg">
          Ask the assistant
        </ButtonLink>
        {partnerHref && partnerLabel && (
          <ButtonLink href={partnerHref} variant="secondary" size="lg">
            {partnerLabel}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
