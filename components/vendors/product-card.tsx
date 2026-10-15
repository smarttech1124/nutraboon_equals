import { AVAILABILITY_LABEL } from "@/lib/vendors/categories";
import type { ProductCard } from "@/lib/vendors/types";

/**
 * A promoted product (ADR-067). Always labelled as sponsored, so it is never
 * mistaken for nutrition guidance. No hooks: used by server pages and chat.
 */
export function ProductCardView({
  card,
  newTab = false,
}: {
  card: ProductCard;
  /** From chat, so the conversation stays open. */
  newTab?: boolean;
}) {
  return (
    <article
      aria-label={card.name}
      className="flex gap-3 rounded-xl border border-line bg-surface p-3 text-sm"
    >
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the resized image.
        <img
          src={card.imageUrl}
          alt=""
          width={72}
          height={72}
          className="size-18 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-18 shrink-0 items-center justify-center rounded-lg bg-subtle text-2xl"
        >
          🛒
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Sponsored · verified vendor
        </p>
        <h3 className="font-semibold text-ink">{card.name}</h3>
        <p className="text-muted">
          {card.vendorName}
          {card.matchedTerm ? ` · for "${card.matchedTerm}"` : ""}
        </p>
        <p className="text-ink">
          {AVAILABILITY_LABEL[card.availability]}
          {card.priceNaira ? ` · about ₦${card.priceNaira.toLocaleString("en-NG")}` : ""}
          {card.whereToBuy.length > 0 ? ` · ${card.whereToBuy.slice(0, 2).join(", ")}` : ""}
        </p>
        <a
          href={`/products/${card.id}`}
          {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
          className="font-semibold text-brand-text underline underline-offset-2"
        >
          View product
          {newTab && (
            <>
              {" "}
              <span className="sr-only">(opens in a new tab)</span>
            </>
          )}
        </a>
      </div>
    </article>
  );
}

/** A labelled group of recommendations, kept visually apart from advice. */
export function ProductRecommendations({
  cards,
  newTab = false,
  heading = "Products you could buy",
}: {
  cards: ProductCard[];
  newTab?: boolean;
  heading?: string;
}) {
  if (cards.length === 0) return null;
  return (
    <section
      aria-label="Sponsored products"
      className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3"
    >
      <p className="text-sm font-semibold text-ink">{heading}</p>
      <p className="text-xs text-muted">
        Sponsored by verified vendors who pay to be listed. They match foods in your plan but are
        not nutrition advice; Nutraboom Equals does not sell them.
      </p>
      <ul className="grid gap-2">
        {cards.map((card) => (
          <li key={card.id}>
            <ProductCardView card={card} newTab={newTab} />
          </li>
        ))}
      </ul>
    </section>
  );
}
