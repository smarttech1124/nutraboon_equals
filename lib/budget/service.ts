import { buildPriceBook, type PriceBook, type PriceRepository } from "./prices";
import type { Region } from "./regions";

/** Prices only change when the seed is re-run, so a short cache is safe. */
const CACHE_MS = 10 * 60 * 1000;

export interface PriceLookup {
  priceBook(region: Region): Promise<PriceBook>;
}

export class PriceService implements PriceLookup {
  private readonly cache = new Map<Region, { book: PriceBook; loadedAt: number }>();

  constructor(
    private readonly repository: PriceRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async priceBook(region: Region): Promise<PriceBook> {
    const cached = this.cache.get(region);
    if (cached && this.now() - cached.loadedAt <= CACHE_MS) return cached.book;
    const [items, aliases] = await Promise.all([
      this.repository.listPricedItems(region),
      this.repository.listAliases(),
    ]);
    const book = buildPriceBook(region, items, aliases);
    this.cache.set(region, { book, loadedAt: this.now() });
    return book;
  }
}
