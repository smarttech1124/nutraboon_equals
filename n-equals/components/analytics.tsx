import type { ReactNode } from "react";
import type { DailyPoint } from "@admin/lib/analytics";

const number = new Intl.NumberFormat("en-NG");
const dayLabel = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const label = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));

/** One headline figure with a short caption (a stat tile, not a chart). */
export function Stat({
  title,
  value,
  detail,
}: {
  title: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{title}</p>
      <p className="text-3xl font-bold text-ink tabular-nums">
        {typeof value === "number" ? number.format(value) : value}
      </p>
      {detail && <p className="text-sm text-muted">{detail}</p>}
    </div>
  );
}

/**
 * Daily counts as a single-series bar chart. One colour (--chart, validated
 * for both colour schemes), no legend because the title names the series,
 * a hover tooltip per bar, and the same numbers as a table for screen
 * readers and anyone who prefers figures.
 */
export function DailyBars({ title, points }: { title: string; points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const width = 560;
  const height = 140;
  const gap = 2;
  const bar = (width - gap * (points.length - 1)) / points.length;
  const peak = points.reduce((best, p) => (p.count > best.count ? p : best), points[0]!);

  return (
    <figure className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-sm text-muted">
          {number.format(total)} in {points.length} days
          {peak.count > 0 ? ` · peak ${number.format(peak.count)} on ${label(peak.day)}` : ""}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}: ${number.format(total)} in the last ${points.length} days. Daily figures are in the table below.`}
      >
        <line x1="0" x2={width} y1={height} y2={height} className="stroke-line" strokeWidth="1" />
        {points.map((p, i) => {
          const h = p.count === 0 ? 0 : Math.max(3, (p.count / max) * (height - 8));
          const x = i * (bar + gap);
          return (
            <g key={p.day} className="group">
              {/* A full-height hit area, so short bars are easy to hover. */}
              <rect x={x} y={0} width={bar} height={height} fill="transparent">
                <title>{`${label(p.day)}: ${number.format(p.count)}`}</title>
              </rect>
              {h > 0 && (
                <path
                  d={`M${x},${height} V${height - h + 4} q0,-4 4,-4 H${x + bar - 4} q4,0 4,4 V${height} Z`}
                  className="pointer-events-none fill-chart opacity-90 group-hover:opacity-100"
                />
              )}
              {(i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
                <text
                  x={x + bar / 2}
                  y={height + 14}
                  textAnchor="middle"
                  className="fill-muted text-[11px]"
                >
                  {label(p.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-text">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Day
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day} className="border-t border-line">
                <td className="py-1">{label(p.day)}</td>
                <td className="py-1 text-right tabular-nums">{number.format(p.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
