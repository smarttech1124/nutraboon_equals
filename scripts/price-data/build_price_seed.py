"""Build prisma/seed/prices.json from the NBS Selected Food Price Watch workbook.

Prices are copied only from the official NBS table, for the items listed in
catalog.json (matched by exact NBS item label). Each item gets the national
average and the six geopolitical-zone averages. Nothing is typed by hand; a
missing label, a missing value or a mismatch between the two sheets aborts
the build.

Usage (see docs/price-data.md):
    python build_price_seed.py <selected food table.xlsx> <month YYYY-MM> <retrieved_at YYYY-MM-DD>
"""

import hashlib
import json
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "prisma" / "seed" / "prices.json"

SOURCE = "National Bureau of Statistics (NBS), Selected Food Price Watch"
SOURCE_URL = "https://microdata.nigerianstat.gov.ng/index.php/catalog/162"
NATIONAL_SHEET_PREFIX = "Selected Food"
ZONE_SHEET = "Zone All item"
ZONES = {
    "NORTH CENTRAL": "north_central",
    "NORTH EAST": "north_east",
    "NORTH WEST": "north_west",
    "SOUTH EAST": "south_east",
    "SOUTH SOUTH": "south_south",
    "SOUTH WEST": "south_west",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(label) -> str:
    return " ".join(str(label or "").split()).lower()


def number(value, where: str) -> float:
    if not isinstance(value, (int, float)) or value <= 0:
        raise SystemExit(f"{where}: expected a positive price, got {value!r}")
    return round(float(value), 2)


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    xlsx, month, retrieved_at = Path(sys.argv[1]), sys.argv[2], sys.argv[3]

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    national_ws = next(ws for ws in wb.worksheets if ws.title.startswith(NATIONAL_SHEET_PREFIX))
    national_rows = list(national_ws.iter_rows(values_only=True))
    header = [norm(h) for h in national_rows[0]]
    # The current month is the last "Average of <Mon>-<YY>" column before MoM.
    avg_cols = [i for i, h in enumerate(header) if h.startswith("average of")]
    current_col = avg_cols[-1]
    national = {norm(r[0]): r for r in national_rows[1:] if r[0]}

    zone_rows = list(wb[ZONE_SHEET].iter_rows(values_only=True))
    zone_header = [str(h or "").strip().upper() for h in zone_rows[0]]
    zone_cols = {ZONES[h]: i for i, h in enumerate(zone_header) if h in ZONES}
    if len(zone_cols) != 6:
        raise SystemExit(f"Expected 6 zone columns, found {zone_header}")
    zones = {norm(r[0]): r for r in zone_rows[1:] if r[0]}

    catalog = json.loads((HERE / "catalog.json").read_text(encoding="utf-8"))
    items = []
    for item in catalog["items"]:
        key = norm(item["nbsLabel"])
        if key not in national or key not in zones:
            raise SystemExit(f"{item['id']}: NBS label {item['nbsLabel']!r} not found in both sheets")
        estimates = {"national": number(national[key][current_col], f"{item['id']} national")}
        for zone, col in zone_cols.items():
            estimates[zone] = number(zones[key][col], f"{item['id']} {zone}")
        items.append(
            {
                "id": item["id"],
                "name": item["name"],
                "unitLabel": item["unitLabel"],
                "unitQuantity": item["unitQuantity"],
                "unitMeasure": item["unitMeasure"],
                "aliases": item["aliases"],
                "unitEvidence": item["unitEvidence"],
                "nbsLabel": item["nbsLabel"].strip(),
                "estimates": estimates,
            }
        )

    payload = {
        "_generated_by": "scripts/price-data/build_price_seed.py - do not edit by hand",
        "source": SOURCE,
        "sourceUrl": SOURCE_URL,
        "sourceVersion": f"Selected Food Price Watch, {month} (column {national_rows[0][current_col]!r})",
        "effectiveMonth": month,
        "retrievedAt": retrieved_at,
        "currency": "NGN",
        "fileSha256": sha256(xlsx),
        "items": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(items)} price items to {OUT}")


if __name__ == "__main__":
    main()
