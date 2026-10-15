import type { Visual } from "@/lib/visuals/library";

/**
 * Reviewed pictures shown with a reply (ADR-085). Each has alt text for
 * screen readers, a caption saying what to notice, and its credit and
 * licence (required by the Creative Commons licences). The written reply
 * always stands on its own; the pictures add to it.
 */
export function VisualGallery({ visuals }: { visuals: Visual[] }) {
  if (visuals.length === 0) return null;
  return (
    <section aria-label="Pictures" className="mt-3 grid gap-3 sm:grid-cols-2">
      {visuals.map((v) => (
        <figure
          key={v.id}
          className="overflow-hidden rounded-2xl border border-line bg-surface text-sm"
        >
          {/* A plain img: the files are served by Wikimedia, and a remote-image
              config for next/image would add nothing for two small pictures. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={v.src}
            alt={v.alt}
            width={v.width}
            height={v.height}
            loading="lazy"
            decoding="async"
            className="h-auto max-h-80 w-full bg-white object-contain"
          />
          <figcaption className="flex flex-col gap-1 px-3 py-2">
            <span className="font-semibold text-ink">{v.title}</span>
            <span className="text-ink">{v.caption}</span>
            <span className="text-xs text-muted">
              Picture:{" "}
              <a
                href={v.credit.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {v.credit.author}
              </a>
              ,{" "}
              {v.credit.licenseUrl ? (
                <a
                  href={v.credit.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer license"
                  className="underline underline-offset-2"
                >
                  {v.credit.license}
                </a>
              ) : (
                v.credit.license
              )}
              , via Wikimedia Commons
            </span>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}
