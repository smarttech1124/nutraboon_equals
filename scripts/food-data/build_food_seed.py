"""Build prisma/seed/foods.json from official source files.

Nutrient values come only from the FAO/INFOODS West African Food Composition
Table 2019 (datasheet "03 NV_sum_39", per 100 g edible portion). Serving gram
weights come only from USDA FoodData Central SR Legacy (April 2018)
food_portion.csv. Nothing is typed by hand; any missing or ambiguous match
aborts the build.

Usage (see docs/food-data.md):
    python build_food_seed.py <WAFCT_2019.xlsx> <sr_legacy_csv_dir> [retrieved_at]
"""

import csv
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "prisma" / "seed" / "foods.json"

WAFCT_SHEET = "03 NV_sum_39 (per 100g EP)"
WAFCT_URL = "https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx"
WAFCT_SOURCE = "FAO/INFOODS Food Composition Table for Western Africa (2019)"
WAFCT_VERSION = "WAFCT 2019, datasheet 03 NV_sum_39 (per 100 g edible portion)"
USDA_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
USDA_SOURCE = "USDA FoodData Central, SR Legacy"
USDA_VERSION = "SR Legacy, April 2018"

# INFOODS tagname in the WAFCT header row -> our field name.
NUTRIENT_TAGS = {
    "ENERC_KCAL": "energyKcal",
    "ENERC_KJ": "energyKj",
    "WATER": "waterG",
    "PROTCNT": "proteinG",
    "FAT": "fatG",
    "CHOAVLDF": "carbohydrateG",
    "FIBTG": "fiberG",
    "CA": "calciumMg",
    "FE": "ironMg",
    "K": "potassiumMg",
    "NA": "sodiumMg",
    "ZN": "zincMg",
    "VITA_RAE": "vitaminARaeMcg",
    "VITC": "vitaminCMg",
    "FOLDFE": "folateDfeMcg",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_value(raw):
    """WAFCT conventions: '[x]' = value for an alternative component definition
    (e.g. crude fibre); 'tr' = trace (stored as 0); '' = no data (None)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1].strip()
    if s == "":
        return None
    if s.lower() == "tr":
        return 0.0
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        raise ValueError(f"Unrecognised WAFCT value {raw!r}")
    return float(s)


def load_wafct(path: Path) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb[WAFCT_SHEET].iter_rows(values_only=True))
    tags = [str(t).strip() if t else "" for t in rows[2]]
    # Energy appears twice (kJ then kcal) under the same tagname ENERC.
    energy_cols = [i for i, t in enumerate(tags) if t == "ENERC"]
    if len(energy_cols) != 2:
        raise ValueError("Expected two ENERC columns (kJ, kcal)")
    columns = {"ENERC_KJ": energy_cols[0], "ENERC_KCAL": energy_cols[1]}
    for tag in NUTRIENT_TAGS:
        if tag.startswith("ENERC"):
            continue
        if tag not in tags:
            raise ValueError(f"Tag {tag} not found in WAFCT header")
        columns[tag] = tags.index(tag)

    foods = {}
    for r in rows[3:]:
        code = r[0]
        if not code or not r[1] or not re.fullmatch(r"\d{2}_\d{3}", str(code)):
            continue
        foods[code] = {
            "name": r[1],
            "scientificName": r[3],
            "nutrients": {NUTRIENT_TAGS[t]: parse_value(r[c]) for t, c in columns.items()},
        }
    return foods


def load_usda_portions(sr_dir: Path) -> dict:
    portions = {}
    with (sr_dir / "food_portion.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            portions.setdefault(r["fdc_id"], []).append(r)
    return portions


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    wafct_path, sr_dir = Path(sys.argv[1]), Path(sys.argv[2])
    retrieved_at = sys.argv[3] if len(sys.argv) > 3 else date.today().isoformat()

    catalog = json.loads((HERE / "catalog.json").read_text(encoding="utf-8"))
    wafct = load_wafct(wafct_path)
    portions = load_usda_portions(sr_dir)

    out_foods = []
    for item in catalog["foods"]:
        src = wafct.get(item["wafct"])
        if not src:
            raise SystemExit(f"{item['id']}: WAFCT code {item['wafct']} not found")
        if src["nutrients"]["energyKcal"] is None:
            raise SystemExit(f"{item['id']}: WAFCT {item['wafct']} has no energy value")

        serving = None
        if item["serving"]:
            s = item["serving"]
            matches = [
                p
                for p in portions.get(s["fdcId"], [])
                if float(p["amount"]) == float(s["amount"]) and p["modifier"] == s["modifier"]
            ]
            if len(matches) != 1:
                raise SystemExit(
                    f"{item['id']}: expected 1 USDA portion for {s}, found {len(matches)}"
                )
            serving = {
                "label": s["label"],
                "grams": float(matches[0]["gram_weight"]),
                "source": USDA_SOURCE,
                "sourceUrl": f"https://fdc.nal.usda.gov/food-details/{s['fdcId']}/nutrients",
                "sourceVersion": USDA_VERSION,
                "sourceRef": f"fdc_id {s['fdcId']}, food_portion id {matches[0]['id']}",
            }

        out_foods.append(
            {
                "id": item["id"],
                "name": item["name"],
                "category": item["category"],
                "aliases": item["aliases"],
                "allergens": item["allergens"],
                "scientificName": src["scientificName"],
                "per100g": src["nutrients"],
                "serving": serving,
                "source": WAFCT_SOURCE,
                "sourceUrl": WAFCT_URL,
                "sourceVersion": WAFCT_VERSION,
                "sourceFoodCode": item["wafct"],
                "sourceFoodName": src["name"],
                "retrievedAt": retrieved_at,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_generated_by": "scripts/food-data/build_food_seed.py - do not edit by hand",
        "sources": {
            "wafct": {"url": WAFCT_URL, "sha256": sha256(wafct_path), "retrievedAt": retrieved_at},
            "usdaSrLegacy": {
                "url": USDA_URL,
                "foodPortionSha256": sha256(sr_dir / "food_portion.csv"),
                "retrievedAt": retrieved_at,
            },
        },
        "foods": out_foods,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(out_foods)} foods to {OUT}")


if __name__ == "__main__":
    main()
