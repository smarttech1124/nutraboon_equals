# Food data pipeline

`prisma/seed/foods.json` is **generated**. Do not edit it by hand.

```text
catalog.json ──┐
WAFCT_2019.xlsx ├─► build_food_seed.py ─► prisma/seed/foods.json ─► prisma/seed.ts ─► PostgreSQL
SR Legacy CSVs ─┘
```

## Sources

| Data                               | Source                                                                                 | File                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Nutrients per 100 g edible portion | FAO/INFOODS Food Composition Table for Western Africa (2019), datasheet `03 NV_sum_39` | https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx                 |
| Household serving gram weights     | USDA FoodData Central, SR Legacy (April 2018), `food_portion.csv`                      | https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip |

Required citation for WAFCT: Vincent, A. et al. 2020. _FAO/INFOODS Food Composition Table for Western Africa (2019) User Guide & Condensed Food Composition Table._ Rome, FAO. FAO permits use in non-commercial products with acknowledgement. **Commercial use needs a licence request to FAO** (www.fao.org/contact-us/licence-request). USDA FoodData Central data is public domain.

The SHA-256 of each source file used is recorded in `foods.json` under `sources`.

## Conventions taken from WAFCT

- `[x]` marks a value for an alternative component definition (e.g. crude fibre instead of total dietary fibre). The number is kept.
- `tr` (trace) is stored as `0`.
- An empty cell is stored as `null` (no data). The app never fills it in.
- Values are per 100 g **edible portion**.

## What is curated by hand (`catalog.json`)

- Which WAFCT entry represents each food (by code), its display name and category.
- Aliases, including local names. Every alias must be unique across foods; the build and the seed both fail otherwise.
- Allergen tags, based on what the food is (e.g. groundnut → `peanut`).
- Which USDA portion gives the serving weight (by `fdcId`, amount and modifier), and a plain-language label for it. Foods with no matching USDA portion (gari, egusi, ogi, bitter leaf, crayfish, some meats) have no serving and are described per 100 g.

Nutrient numbers and gram weights are never typed into the catalog.

## Rebuilding

```bash
pip install openpyxl
python scripts/food-data/build_food_seed.py path/to/WAFCT_2019.xlsx path/to/FoodData_Central_sr_legacy_food_csv_2018-04 2026-10-01
npm run db:seed
```

The last argument is the retrieval date recorded as `retrievedAt`.
