import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { AliasEntry } from "@/lib/nutrition/types";
import type { PricedItem, PriceRepository } from "./prices";
import type { Region } from "./regions";

export class PrismaPriceRepository implements PriceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAliases(): Promise<AliasEntry[]> {
    const rows = await this.prisma.priceItemAlias.findMany({
      select: { alias: true, itemId: true },
    });
    return rows.map((r) => ({ alias: r.alias, foodId: r.itemId }));
  }

  /** Latest estimate per item for the region, or the national average when the region has none. */
  async listPricedItems(region: Region): Promise<PricedItem[]> {
    const items = await this.prisma.priceItem.findMany({
      include: {
        estimates: {
          where: { region: { in: region === "national" ? ["national"] : [region, "national"] } },
          orderBy: { effectiveDate: "desc" },
        },
      },
    });
    return items.flatMap((item) => {
      const estimate =
        item.estimates.find((e) => e.region === region) ??
        item.estimates.find((e) => e.region === "national");
      if (!estimate) return [];
      return [
        {
          id: item.id,
          name: item.name,
          unitLabel: item.unitLabel,
          unitQuantity: item.unitQuantity,
          unitMeasure: item.unitMeasure,
          price: Number(estimate.price),
          region: estimate.region,
          source: estimate.source,
          sourceUrl: estimate.sourceUrl,
          effectiveMonth: estimate.effectiveDate.toISOString().slice(0, 7),
        },
      ];
    });
  }
}
