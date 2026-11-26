"""Download real field photos of our three pests from iNaturalist, ready to label.

iNaturalist photos are taken by people in gardens and farms, so they look much more like
what the turret sees than lab photos do. They have NO boxes: upload them to the Roboflow
project and label them with the labeling rules in training/README.md.

Only research-grade observations with a CC0 or CC BY photo licence are kept, and every
photo is written to credits.csv (photographer, licence, link) for the thesis.

Run it on the laptop or in Colab (it needs internet; standard library only):

    python training/fetch_inaturalist.py --per-class 300
    python training/fetch_inaturalist.py --per-class 300 --place-id 6774   # one country only

Output (git-ignored, under training/raw/):
    inaturalist/looper/inat_<observation>_<photo>.jpg
    inaturalist/armyworm_cutworm/...
    inaturalist/aphid_colony/...
    inaturalist/credits.csv

Run it again with a bigger --per-class to get more: photos already downloaded are skipped.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CLASSES, RAW_DIR  # noqa: E402

API = "https://api.inaturalist.org/v1/observations"
USER_AGENT = "pestblaster-thesis-dataset/1.0"
LICENSES = ("cc0", "cc-by")  # free to reuse with credit; NC/ND photos are left out

# iNaturalist "Life Stage" annotation (term 1); value 6 = Larva. Used for the caterpillars,
# so adult moths (which we do not detect) are not downloaded.
LIFE_STAGE_TERM = 1
LARVA_VALUE = 6

# Species per class. Lettuce pests in the Philippines and Southeast Asia first.
TAXA: dict[str, dict] = {
    "looper": {
        "names": ["Trichoplusia ni", "Chrysodeixis eriosoma", "Chrysodeixis chalcites",
                  "Thysanoplusia orichalcea"],
        "larva_only": True,
    },
    "armyworm_cutworm": {
        "names": ["Spodoptera litura", "Spodoptera exigua", "Spodoptera frugiperda",
                  "Agrotis ipsilon", "Agrotis segetum"],
        "larva_only": True,
    },
    "aphid_colony": {
        "names": ["Myzus persicae", "Nasonovia ribisnigri", "Aphis gossypii",
                  "Macrosiphum euphorbiae"],
        "larva_only": False,
    },
}
assert list(TAXA) == CLASSES, "TAXA must use our class names, in the same order"

CREDIT_FIELDS = ["file", "class", "species", "observation_url", "photographer", "license",
                 "photo_url", "observed_on", "place"]


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def _get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def query_url(species: str, page: int, larva_only: bool, place_id: int | None) -> str:
    params = {
        "taxon_name": species,
        "quality_grade": "research",
        "photo_license": ",".join(LICENSES),
        "photos": "true",
        "per_page": 200,
        "page": page,
        "order_by": "id",
        "order": "desc",
    }
    if larva_only:
        params["term_id"] = LIFE_STAGE_TERM
        params["term_value_id"] = LARVA_VALUE
    if place_id:
        params["place_id"] = place_id
    return API + "?" + urllib.parse.urlencode(params)


def photos_of(obs: dict) -> Iterator[dict]:
    """Photos of one observation that have an allowed licence, with a large-size URL."""
    for photo in obs.get("photos") or []:
        lic = (photo.get("license_code") or "").lower()
        url = photo.get("url") or ""
        if lic not in LICENSES or not url:
            continue
        yield {"id": photo.get("id"), "license": lic,
               "url": url.replace("/square.", "/large."),
               "attribution": photo.get("attribution") or ""}


def fetch_class(cls: str, out_dir: Path, per_class: int, place_id: int | None,
                get_json: Callable[[str], dict] = _get_json,
                get_bytes: Callable[[str], bytes] = _get_bytes,
                max_photos_per_obs: int = 2, pause: float = 1.0) -> list[dict]:
    """Download up to per_class photos of one class. Returns credit rows for new files."""
    cfg = TAXA[cls]
    dest = out_dir / cls
    dest.mkdir(parents=True, exist_ok=True)
    have = len(list(dest.glob("inat_*.jpg")))
    rows: list[dict] = []
    # Share the quota between species so one common species does not fill the class.
    per_species = max(1, -(-(per_class - have) // len(cfg["names"])))
    for species in cfg["names"]:
        got = 0
        page = 1
        while got < per_species and have + len(rows) < per_class:
            data = get_json(query_url(species, page, cfg["larva_only"], place_id))
            results = data.get("results") or []
            if not results:
                break
            for obs in results:
                for n, photo in enumerate(photos_of(obs)):
                    if n >= max_photos_per_obs:   # several photos of one bug = near-copies
                        break
                    name = f"inat_{obs['id']}_{photo['id']}.jpg"
                    path = dest / name
                    if path.exists():
                        continue
                    try:
                        path.write_bytes(get_bytes(photo["url"]))
                    except OSError as err:  # network error on one photo: skip it
                        print(f"  skip {photo['url']}: {err}")
                        continue
                    rows.append({
                        "file": f"{cls}/{name}", "class": cls, "species": species,
                        "observation_url": f"https://www.inaturalist.org/observations/{obs['id']}",
                        "photographer": photo["attribution"], "license": photo["license"],
                        "photo_url": photo["url"], "observed_on": obs.get("observed_on") or "",
                        "place": obs.get("place_guess") or "",
                    })
                    got += 1
                    time.sleep(pause)
                    if got >= per_species or have + len(rows) >= per_class:
                        break
                if got >= per_species or have + len(rows) >= per_class:
                    break
            page += 1
            time.sleep(pause)
        print(f"  {cls} / {species}: {got} new photos")
    return rows


def append_credits(path: Path, rows: list[dict]) -> None:
    new_file = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CREDIT_FIELDS)
        if new_file:
            writer.writeheader()
        writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-class", type=int, default=300, help="photos wanted per pest (default 300)")
    ap.add_argument("--classes", nargs="+", choices=CLASSES, default=CLASSES)
    ap.add_argument("--place-id", type=int, default=None,
                    help="iNaturalist place id to stay in one country or region (look it up on inaturalist.org/places)")
    ap.add_argument("--out", type=Path, default=RAW_DIR / "inaturalist")
    args = ap.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    total = 0
    for cls in args.classes:
        print(f"{cls}:")
        rows = fetch_class(cls, args.out, args.per_class, args.place_id)
        append_credits(args.out / "credits.csv", rows)
        total += len(rows)
    print(f"Done: {total} new photos in {args.out}. Credits in {args.out / 'credits.csv'}.")
    print("Next: upload each class folder to Roboflow and draw the boxes (training/README.md, Labeling).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
