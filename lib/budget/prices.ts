import { z } from "zod";
import { normalizeText, type AliasIndex, buildAliasIndex } from "@/lib/nutrition/match";
import type { AliasEntry } from "@/lib/nutrition/types";
import { REGIONS, type Region } from "./regions";

/** A priced item for one region, ready for costing. */
export type PricedItem = {
  id: string;
  name: string;
  unitLabel: string;
  /** What one unit holds, e.g. 1000 g for "1 kg" (ADR-066: costing by weight or count). */
  unitQuantity?: number;
  unitMeasure?: "g" | "ml" | "piece";
  /** Estimated price of one unit, in naira. */
  price: number;
  region: Region;
  source: string;
  sourceUrl: string;
  /** e.g. "2026-05" */
  effectiveMonth: string;
};

export interface PriceRepository {
  listAliases(): Promise<AliasEntry[]>;
  /** Every item priced for `region`, falling back to the national average. */
  listPricedItems(region: Region): Promise<PricedItem[]>;
}

const seedItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  unitLabel: z.string().min(1),
  unitQuantity: z.number().positive(),
  unitMeasure: z.enum(["g", "ml", "piece"]),
  aliases: z.array(z.string().min(1)).min(1),
  unitEvidence: z.string().min(1),
  nbsLabel: z.string().min(1),
  estimates: z
    .object({ national: z.number().positive() })
    .catchall(z.number().positive())
    .refine((e) => Object.keys(e).every((k) => (REGIONS as readonly string[]).includes(k)), {
      message: "unknown region",
    }),
});

export const priceSeedSchema = z.object({
  source: z.string().min(1),
  sourceUrl: z.url(),
  sourceVersion: z.string().min(1),
  effectiveMonth: z.string().regex(/^\d{4}-\d{2}$/),
  retrievedAt: z.iso.date(),
  currency: z.literal("NGN"),
  items: z.array(seedItemSchema).min(1),
});

export type PriceSeed = z.infer<typeof priceSeedSchema>;

/** Validates prices.json; aliases must be unique after normalisation. */
export function parsePriceSeed(json: unknown): { seed: PriceSeed; aliases: AliasEntry[] } {
  const seed = priceSeedSchema.parse(json);
  const owner = new Map<string, string>();
  for (const item of seed.items) {
    for (const raw of item.aliases) {
      const alias = normalizeText(raw);
      const existing = owner.get(alias);
      if (existing && existing !== item.id) {
        throw new Error(`Price alias "${alias}" is used by both "${existing}" and "${item.id}"`);
      }
      owner.set(alias, item.id);
    }
  }
  return { seed, aliases: [...owner].map(([alias, foodId]) => ({ alias, foodId })) };
}

export function pricedItemsFromSeed(seed: PriceSeed, region: Region): PricedItem[] {
  return seed.items.map((item) => {
    const regional = (item.estimates as Record<string, number>)[region];
    return {
      id: item.id,
      name: item.name,
      unitLabel: item.unitLabel,
      unitQuantity: item.unitQuantity,
      unitMeasure: item.unitMeasure,
      price: regional ?? item.estimates.national,
      region: regional !== undefined ? region : "national",
      source: seed.source,
      sourceUrl: seed.sourceUrl,
      effectiveMonth: seed.effectiveMonth,
    };
  });
}

/** Repository over the seed file; used by tests and as a reference implementation. */
export class InMemoryPriceRepository implements PriceRepository {
  constructor(
    private readonly seed: PriceSeed,
    private readonly aliases: AliasEntry[],
  ) {}

  async listAliases(): Promise<AliasEntry[]> {
    return this.aliases;
  }

  async listPricedItems(region: Region): Promise<PricedItem[]> {
    return pricedItemsFromSeed(this.seed, region);
  }
}

/** A region's prices plus an alias index to find items by name. */
export type PriceBook = {
  region: Region;
  items: Map<string, PricedItem>;
  index: AliasIndex;
};

export function buildPriceBook(
  region: Region,
  items: PricedItem[],
  aliases: AliasEntry[],
): PriceBook {
  return { region, items: new Map(items.map((i) => [i.id, i])), index: buildAliasIndex(aliases) };
}
