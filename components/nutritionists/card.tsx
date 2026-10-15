import type { NutritionistCard } from "@/lib/nutritionists/directory";

/** Shared by the directory, profile pages and chat suggestions (ADR-064). No hooks. */

export function formatFee(minor: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function sessionTypesText(types: NutritionistCard["sessionTypes"]): string {
  return types.map((t) => (t === "online" ? "Online" : "In person")).join(" or ");
}

export function NutritionistCardView({
  card,
  compact = false,
  newTab = false,
  showLink = true,
}: {
  card: NutritionistCard;
  /** Fewer details, for chat. */
  compact?: boolean;
  /** Open the profile in a new tab (from chat, so the conversation stays open). */
  newTab?: boolean;
  /** False on the profile page itself. */
  showLink?: boolean;
}) {
  const place = [card.city, card.state].filter(Boolean).join(", ");
  return (
    <article
      aria-label={card.name}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        {card.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized image.
          <img
            src={card.photoUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-subtle text-2xl"
          >
            👤
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{card.name}</h3>
          <p className="text-muted">{card.title}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-text">
            <span aria-hidden="true">✓</span> Verified by Nutraboom Equals
          </p>
        </div>
      </div>
      <dl className="grid gap-1">
        <div>
          <dt className="sr-only">Specialisations</dt>
          <dd className="text-ink">{card.specializations.join(" · ")}</dd>
        </div>
        {!compact && card.qualificationSummary.length > 0 && (
          <div>
            <dt className="sr-only">Qualifications</dt>
            <dd className="text-muted">{card.qualificationSummary.join("; ")}</dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 text-muted">
          {place && (
            <>
              <dt className="sr-only">Location</dt>
              <dd>{place}</dd>
            </>
          )}
          <dt className="sr-only">Experience</dt>
          <dd>
            {card.yearsExperience} year{card.yearsExperience === 1 ? "" : "s"} experience
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="sr-only">Session</dt>
          <dd className="text-ink">
            {sessionTypesText(card.sessionTypes)} · {card.sessionMinutes} min ·{" "}
            <span className="font-semibold">{formatFee(card.sessionFeeMinor)}</span> per session
          </dd>
        </div>
        {!compact && card.availability.length > 0 && (
          <div>
            <dt className="sr-only">Availability</dt>
            <dd className="text-muted">Available {card.availability.join(", ")}</dd>
          </div>
        )}
      </dl>
      {showLink && (
        <a
          href={`/nutritionists/${card.id}`}
          {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong"
        >
          View profile and book
          {newTab && (
            <>
              {" "}
              <span className="sr-only">(opens in a new tab)</span>
            </>
          )}
        </a>
      )}
    </article>
  );
}
