# Price data pipeline

`prisma/seed/prices.json` is **generated**. Do not edit it by hand.

```text
catalog.json ───────────────┐
selected food table.xlsx ───┴─► build_price_seed.py ─► prisma/seed/prices.json ─► prisma/seed.ts ─► PostgreSQL
```

## Source

| Data                                                     | Source                                                                                          | File                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Average retail prices, national and by geopolitical zone | National Bureau of Statistics (NBS), _Selected Food Price Watch_, May 2026 (released June 2026) | `Selected_Food_Report_May 26.zip` → `selected food table May 26.xlsx`, from https://microdata.nigerianstat.gov.ng/index.php/catalog/162 |

NBS collects these prices in all 774 local government areas, from about 10,000 respondents. The workbook has national averages (sheet `Selected Food May 2026`) and averages for the six geopolitical zones (sheet `Zone All item`). It does not include per-state averages. The SHA-256 of the workbook used is recorded in `prices.json`.

These are **estimates**. The app always labels them with their month and region, and never presents them as current market prices (ADR-007).

## Units: why some items are missing

NBS names many items without a unit ("Rice Local, short-Grained", "Plantain (ripe)", "Beef Boneless"). An item is seeded only when its unit is documented, either in the item label (e.g. "Palm oil, 75cl") or in the report text (e.g. "Tomatoes 1kg"). `catalog.json` records that evidence in `unitEvidence` for each item.

These NBS items are **excluded** until their unit is confirmed: rice (local, imported, broken), white beans, yellow garri, plantain, potatoes, maize, carrots, beef, goat meat, chicken, fish, crayfish and the single-egg price. The assistant says "no price estimate" for them and leaves them out of totals.

To add one, confirm its unit from an NBS source, add it to `catalog.json` with `unitEvidence`, and rebuild.

## Data considered and not used

The WFP food price dataset on HDX (`wfp_food_prices_nga.csv`, CC BY-IGO, retrieved 2026-10-02) was evaluated first. Its 2025–2026 retail prices cover only Borno, Yobe and Adamawa, and it has no gari. It would misrepresent prices for most of the country, so it is not used.

## Rebuilding

```bash
pip install openpyxl
python scripts/price-data/build_price_seed.py "path/to/selected food table May 26.xlsx" 2026-05 2026-10-02
npm run db:seed
```

Arguments: the workbook, the month the prices refer to (`YYYY-MM`), and the retrieval date.
