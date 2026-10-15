import { readFileSync } from "node:fs";
import {
  InMemoryPriceRepository,
  parsePriceSeed,
  pricedItemsFromSeed,
  buildPriceBook,
} from "@/lib/budget/prices";
import type { Region } from "@/lib/budget/regions";
import { PriceService } from "@/lib/budget/service";

/** The real price seed, so tests use the same estimates the database holds. */
export const priceJson = JSON.parse(readFileSync("prisma/seed/prices.json", "utf8"));
export const prices = parsePriceSeed(priceJson);

export function priceService() {
  return new PriceService(new InMemoryPriceRepository(prices.seed, prices.aliases));
}

export function priceBook(region: Region = "national") {
  return buildPriceBook(region, pricedItemsFromSeed(prices.seed, region), prices.aliases);
}

/** Seed estimate for an item and region, for building expectations without typing numbers. */
export function estimate(itemId: string, region: Region = "national"): number {
  const item = prices.seed.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No price item "${itemId}"`);
  const regional = (item.estimates as Record<string, number>)[region];
  return regional ?? item.estimates.national;
}
