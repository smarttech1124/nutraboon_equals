import { getPrisma } from "@/lib/db";

/**
 * Daily product counts for vendor analytics (ADR-067): how often a product
 * was recommended (impression), opened (view) and a "where to buy" link used
 * (click). Counts only: no user, session or address is stored.
 */
/** The first day of the last `days` days, for analytics queries. */
export function statsSince(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export type StatKind = "impressions" | "views" | "clicks";

function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export async function countProducts(ids: string[], kind: StatKind): Promise<void> {
  if (ids.length === 0) return;
  const day = today();
  const prisma = getPrisma();
  await prisma.$transaction(
    [...new Set(ids)].map((productId) =>
      prisma.productStat.upsert({
        where: { productId_day: { productId, day } },
        create: { productId, day, [kind]: 1 },
        update: { [kind]: { increment: 1 } },
      }),
    ),
  );
}

/** Never lets analytics break the page that triggered them. */
export function countQuietly(ids: string[], kind: StatKind): Promise<void> {
  return countProducts(ids, kind).catch((error) => {
    console.error(
      JSON.stringify({
        event: "product_stats_failed",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  });
}
