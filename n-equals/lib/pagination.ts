/** Rows per page in every n-equals table. */
export const PAGE_SIZE = 20;

export type Paging = { page: number; pages: number; total: number; skip: number; take: number };

/** Reads ?page= safely: anything that is not a whole number from 1 becomes 1. */
export function pageParam(value: unknown): number {
  const n = Math.floor(Number(typeof value === "string" ? value : NaN));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** The page to show for a total, clamped so a stale link to page 9 of 3 shows page 3. */
export function paging(requested: number, total: number, size = PAGE_SIZE): Paging {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pages);
  return { page, pages, total, skip: (page - 1) * size, take: size };
}

/** One page of an in-memory list (for lists a service returns whole). */
export function pageOf<T>(items: T[], requested: number, size = PAGE_SIZE): [T[], Paging] {
  const p = paging(requested, items.length, size);
  return [items.slice(p.skip, p.skip + p.take), p];
}
