import Link from "next/link";
import { PAGE_SIZE, type Paging } from "@admin/lib/pagination";

/**
 * Previous, page numbers and Next under a table. Links keep the page's other
 * query parameters (search, filters); `param` names the page parameter when a
 * page has more than one table.
 */
export function Pagination({
  path,
  query = {},
  paging,
  param = "page",
  label = "Pages",
}: {
  path: string;
  query?: Record<string, string | undefined>;
  paging: Paging;
  param?: string;
  label?: string;
}) {
  const { page, pages, total } = paging;
  if (total === 0) return null;
  const href = (n: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    if (n > 1) params.set(param, String(n));
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  // At most seven numbers: the first, the last and those around the current page.
  const numbers = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const link =
    "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line px-3 text-ink hover:bg-subtle";

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        Showing {first}–{last} of {total}
      </p>
      {pages > 1 && (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {page > 1 ? (
              <Link href={href(page - 1)} className={link}>
                Previous
              </Link>
            ) : (
              <span aria-disabled="true" className={`${link} opacity-50`}>
                Previous
              </span>
            )}
          </li>
          {numbers.map((n, i) => (
            <li key={n} className="flex items-center gap-1">
              {i > 0 && n - numbers[i - 1]! > 1 && (
                <span aria-hidden="true" className="px-1 text-muted">
                  …
                </span>
              )}
              <Link
                href={href(n)}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={
                  n === page ? `${link} border-brand bg-brand text-white hover:bg-brand` : link
                }
              >
                {n}
              </Link>
            </li>
          ))}
          <li>
            {page < pages ? (
              <Link href={href(page + 1)} className={link}>
                Next
              </Link>
            ) : (
              <span aria-disabled="true" className={`${link} opacity-50`}>
                Next
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
