"""Build the YOLO training set from the labeled photos in training/raw/.

    python training/prepare_dataset.py --dry-run     # report only, write nothing
    python training/prepare_dataset.py               # build training/dataset/
    python training/prepare_dataset.py --zip         # also make dataset.zip for Google Drive

What it does:
  1. Reads every source folder listed in training/sources.yaml (YOLO format).
  2. Renames source classes to ours (diamondback_larva, looper, aphid_cluster), drops the rest.
  3. Removes unreadable and tiny photos, broken label lines, and duplicates
     (including resized copies: the largest copy is kept).
  4. Shrinks photos to --max-size on the longest side (labels are fractions, so they still fit).
  5. Splits 70 / 20 / 10 into train / val / test, keeping each "group" (for example one
     plant) in a single split. Splits are remembered in manifest.json, so a photo that was
     in test stays in test when you add more photos later.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageOps, UnidentifiedImageError

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CLASSES, DATASET_DIR, IMAGE_EXTS, RAW_DIR, ROOT, SPLITS  # noqa: E402

MIN_SIDE = 64
TARGET_BOXES = 300
SPLIT_RATIOS = {"train": 0.7, "val": 0.2, "test": 0.1}


@dataclass
class Box:
    cls: int
    x: float
    y: float
    w: float
    h: float

    def line(self) -> str:
        return f"{self.cls} {self.x:.6f} {self.y:.6f} {self.w:.6f} {self.h:.6f}"


@dataclass
class Item:
    source: str
    path: Path
    boxes: list[Box]
    group: str
    width: int = 0
    height: int = 0
    dhash: str = ""
    key: str = ""  # content hash, used as the output file name and in the manifest


@dataclass
class Report:
    warnings: list[str] = field(default_factory=list)
    dropped: Counter = field(default_factory=Counter)
    unmapped: Counter = field(default_factory=Counter)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


# ---------- reading sources ----------

def norm(name: str) -> str:
    return re.sub(r"[\s_\-]+", " ", str(name)).strip().lower()


def source_class_names(folder: Path) -> list[str]:
    """Class names of a YOLO export, from data.yaml or classes.txt (id order)."""
    for yml in sorted(folder.rglob("data.yaml")):
        names = (yaml.safe_load(yml.read_text()) or {}).get("names")
        if isinstance(names, dict):
            return [names[k] for k in sorted(names, key=int)]
        if isinstance(names, list):
            return names
    for txt in sorted(folder.rglob("classes.txt")):
        return [ln.strip() for ln in txt.read_text().splitlines() if ln.strip()]
    return []


def find_label(image: Path, source_dir: Path) -> Path | None:
    """Label file for an image: same folder, or the matching path under a labels/ folder."""
    same = image.with_suffix(".txt")
    if same.exists():
        return same
    parts = list(image.relative_to(source_dir).parts)
    for i, p in enumerate(parts):
        if p == "images":
            cand = source_dir.joinpath(*parts[:i], "labels", *parts[i + 1 :]).with_suffix(".txt")
            if cand.exists():
                return cand
    return None


def parse_label(text: str, mapping: dict[int, int | None], where: str, report: Report) -> list[Box] | None:
    boxes: list[Box] = []
    for n, raw in enumerate(text.splitlines(), 1):
        parts = raw.split()
        if not parts:
            continue
        if len(parts) != 5:
            report.warn(f"{where}:{n} is not 'class x y w h' (polygon labels are not supported), photo skipped")
            return None
        try:
            src_cls = int(parts[0])
            x, y, w, h = (float(v) for v in parts[1:])
        except ValueError:
            report.warn(f"{where}:{n} has a non-number, photo skipped")
            return None
        if not all(0 <= v <= 1 for v in (x, y, w, h)) or w <= 0 or h <= 0:
            report.warn(f"{where}:{n} box is outside the photo, photo skipped")
            return None
        if src_cls not in mapping:
            report.warn(f"{where}:{n} uses class id {src_cls}, which the source's class list does not have, photo skipped")
            return None
        ours = mapping[src_cls]
        if ours is None:
            report.dropped["box of an unmapped class"] += 1
            continue
        boxes.append(Box(ours, x, y, w, h))
    return boxes


def load_sources(config: dict, raw_dir: Path, report: Report) -> list[Item]:
    items: list[Item] = []
    sources = (config or {}).get("sources") or {}
    on_disk = {p.name for p in raw_dir.iterdir() if p.is_dir()} if raw_dir.exists() else set()
    for extra in sorted(on_disk - set(sources)):
        report.warn(f"raw/{extra} is not listed in sources.yaml, skipped")

    for name, spec in sources.items():
        spec = spec or {}
        folder = raw_dir / name
        if not folder.is_dir():
            report.warn(f"sources.yaml lists '{name}' but raw/{name} does not exist")
            continue
        negatives = bool(spec.get("negatives"))
        group_re = re.compile(spec["group"]) if spec.get("group") else None

        mapping: dict[int, int | None] = {}
        if not negatives:
            names = source_class_names(folder)
            if not names:
                report.warn(f"raw/{name} has no data.yaml or classes.txt, so its class ids cannot be read; skipped")
                continue
            wanted = {norm(k): v for k, v in (spec.get("map") or {}).items()}
            for i, cname in enumerate(names):
                target = wanted.get(norm(cname))
                if target is not None and target not in CLASSES:
                    raise SystemExit(f"sources.yaml: '{name}' maps '{cname}' to unknown class '{target}'. Use one of {CLASSES} or null.")
                if target is None and norm(cname) not in wanted:
                    report.unmapped[f"{name}: {cname}"] += 1
                mapping[i] = CLASSES.index(target) if target else None

        for img in sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXTS):
            where = f"raw/{name}/{img.relative_to(folder)}"
            if negatives:
                boxes: list[Box] | None = []
            else:
                label = find_label(img, folder)
                if label is None:
                    report.dropped["photo without a label file"] += 1
                    continue
                boxes = parse_label(label.read_text(), mapping, where, report)
                if boxes is None:
                    report.dropped["photo with a broken label"] += 1
                    continue
                if not boxes:
                    # Labeled photo whose pests are all other species. It is not a clean
                    # "no pest" example, so leave it out rather than teach the wrong thing.
                    report.dropped["photo with only unmapped pests"] += 1
                    continue
            m = group_re.search(img.stem) if group_re else None
            group = f"{name}/{m.group(1) if m and m.groups() else m.group(0)}" if m else f"{name}/{img.stem}"
            items.append(Item(source=name, path=img, boxes=boxes, group=group))
    return items


# ---------- checking photos ----------

HASH_SIZE = 16
# Photos whose fingerprints differ in at most this many of 256 bits count as the same photo.
# Measured: resized or re-saved JPEG copies differ by 0-9 bits; distinct photos of very
# similar leaves by 10 or more. Missing a copy only leaks a little; merging two different
# photos would wrongly drop one, so the limit errs on the low side.
SAME_PHOTO_BITS = 8


def dhash(img: Image.Image, size: int = HASH_SIZE) -> str:
    """Difference hash (size x size bits): equal for the same photo at another size or quality."""
    small = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = small.tobytes()
    bits = 0
    for row in range(size):
        for col in range(size):
            i = row * (size + 1) + col
            bits = (bits << 1) | (px[i] > px[i + 1])
    return f"{bits:0{size * size // 4}x}"


def same_labels(a: list[Box], b: list[Box], tol: float = 0.02) -> bool:
    """True when two label lists describe the same pests in the same places."""
    if len(a) != len(b):
        return False
    left = sorted(a, key=lambda x: (x.cls, x.x, x.y))
    right = sorted(b, key=lambda x: (x.cls, x.x, x.y))
    return all(
        p.cls == q.cls and abs(p.x - q.x) <= tol and abs(p.y - q.y) <= tol
        and abs(p.w - q.w) <= tol and abs(p.h - q.h) <= tol
        for p, q in zip(left, right)
    )


def inspect(items: list[Item], report: Report) -> list[Item]:
    ok: list[Item] = []
    for it in items:
        try:
            with Image.open(it.path) as im:
                im = ImageOps.exif_transpose(im)
                it.width, it.height = im.size
                it.dhash = dhash(im)
        except (UnidentifiedImageError, OSError):
            report.dropped["unreadable photo"] += 1
            continue
        if min(it.width, it.height) < MIN_SIDE:
            report.dropped[f"photo smaller than {MIN_SIDE}px"] += 1
            continue
        # Unique per source file (two identical files labeled differently must not overwrite
        # each other) and stable across rebuilds, so the manifest keeps each photo's split.
        h = hashlib.sha1(it.path.read_bytes())
        h.update(f"{it.source}/{it.path.name}".encode())
        it.key = h.hexdigest()[:16]
        ok.append(it)
    return ok


def similar_groups(items: list[Item]) -> list[list[Item]]:
    """Group photos within SAME_PHOTO_BITS of a group's first (largest) photo.

    Each photo is compared with group leaders only, never chained through other members,
    so a series of similar-looking shots of one bed cannot collapse into one giant group.
    """
    if not items:
        return []
    order = sorted(items, key=lambda i: i.width * i.height, reverse=True)
    bits = np.array([[int(c, 16) for c in it.dhash] for it in order], dtype=np.uint8)
    bits = np.unpackbits(bits[:, :, None], axis=2)[:, :, 4:].reshape(len(order), -1)
    leaders: list[int] = []
    groups: list[list[Item]] = []
    for i, it in enumerate(order):
        if leaders:
            dist = np.count_nonzero(bits[leaders] != bits[i], axis=1)
            j = int(dist.argmin())
            if dist[j] <= SAME_PHOTO_BITS:
                groups[j].append(it)
                continue
        leaders.append(i)
        groups.append([it])
    return groups


def dedupe(items: list[Item], report: Report) -> list[Item]:
    """Drop copies of the same photo with the same labels, keeping the largest copy.

    Photos that look the same but are labeled differently are all kept and reported,
    because they may be two real shots of one leaf (a pest moved) or a labeling mistake.
    """
    kept: list[Item] = []
    for copies in similar_groups(items):
        copies.sort(key=lambda i: i.width * i.height, reverse=True)
        unique: list[Item] = []
        for it in copies:
            twin = next((u for u in unique if same_labels(u.boxes, it.boxes)), None)
            if twin:
                report.dropped["duplicate photo"] += 1
            else:
                unique.append(it)
        if len(unique) > 1:
            report.warn(
                "these photos look the same but have different labels, all kept; check they are right: "
                + ", ".join(str(u.path) for u in unique)
            )
        # Near-identical photos must share a split, or test would leak into training.
        for u in unique[1:]:
            u.group = unique[0].group
        kept.extend(unique)
    return kept


# ---------- splitting ----------

def assign_splits(items: list[Item], manifest: dict[str, str], seed: int) -> dict[str, str]:
    """Split by group. Photos already in the manifest keep their split."""
    groups: dict[str, list[Item]] = defaultdict(list)
    for it in items:
        groups[it.group].append(it)

    result: dict[str, str] = {}
    fresh: list[str] = []
    for g, members in groups.items():
        known = [manifest[m.key] for m in members if m.key in manifest]
        if known:
            # A group that already has a split keeps it (test first, so test never leaks).
            split = "test" if "test" in known else "val" if "val" in known else "train"
            for m in members:
                result[m.key] = split
        else:
            fresh.append(g)

    rng = random.Random(seed)
    fresh.sort()
    rng.shuffle(fresh)
    counts = Counter(result.values())
    total = len(items)
    for g in fresh:
        # Put each new group where the split is furthest below its target share.
        need = {s: SPLIT_RATIOS[s] * total - counts[s] for s in SPLITS}
        split = max(SPLITS, key=lambda s: need[s])
        for m in groups[g]:
            result[m.key] = split
            counts[split] += 1
    return result


# ---------- writing ----------

def write_dataset(items: list[Item], splits: dict[str, str], out: Path, max_size: int) -> None:
    for split in SPLITS:
        for kind in ("images", "labels"):
            d = out / kind / split
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True)
    for it in items:
        split = splits[it.key]
        with Image.open(it.path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            if max(im.size) > max_size:
                im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            im.save(out / "images" / split / f"{it.key}.jpg", quality=92)
        (out / "labels" / split / f"{it.key}.txt").write_text("\n".join(b.line() for b in it.boxes) + ("\n" if it.boxes else ""))
    (out / "data.yaml").write_text(
        yaml.safe_dump(
            {"path": ".", "train": "images/train", "val": "images/val", "test": "images/test",
             "names": {i: c for i, c in enumerate(CLASSES)}},
            sort_keys=False,
        )
    )


def summarize(items: list[Item], splits: dict[str, str]) -> dict:
    table = {s: {"photos": 0, "no_pest_photos": 0, **{c: 0 for c in CLASSES}} for s in SPLITS}
    for it in items:
        row = table[splits[it.key]]
        row["photos"] += 1
        if not it.boxes:
            row["no_pest_photos"] += 1
        for b in it.boxes:
            row[CLASSES[b.cls]] += 1
    return table


def print_summary(table: dict, report: Report) -> None:
    cols = ["photos", "no_pest_photos", *CLASSES]
    print("\nBoxes per pest (and photos) per split")
    print(f"{'split':6s} " + " ".join(f"{c:>17s}" for c in cols))
    for s in SPLITS:
        print(f"{s:6s} " + " ".join(f"{table[s][c]:>17d}" for c in cols))
    for c in CLASSES:
        have = sum(table[s][c] for s in SPLITS)
        if have < TARGET_BOXES:
            print(f"  ! {c}: {have} boxes, aim for at least {TARGET_BOXES} ({TARGET_BOXES - have} more)")
    if report.dropped:
        print("\nLeft out:")
        for reason, n in report.dropped.most_common():
            print(f"  {n:5d}  {reason}")
    if report.unmapped:
        print("\nSource classes not in sources.yaml (their boxes were dropped):")
        for name in sorted(report.unmapped):
            print(f"  {name}")
    if report.warnings:
        print(f"\nWarnings ({len(report.warnings)}):")
        for w in report.warnings[:40]:
            print(f"  - {w}")
        if len(report.warnings) > 40:
            print(f"  ... and {len(report.warnings) - 40} more (see report.json)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, default=RAW_DIR)
    ap.add_argument("--sources", type=Path, default=ROOT / "sources.yaml")
    ap.add_argument("--out", type=Path, default=DATASET_DIR)
    ap.add_argument("--max-size", type=int, default=1280, help="longest side of saved photos (default 1280)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    ap.add_argument("--zip", action="store_true", help="also write dataset.zip next to the dataset folder")
    args = ap.parse_args(argv)

    if not args.sources.exists():
        print(f"{args.sources} not found. Copy sources.example.yaml to sources.yaml and list your folders.")
        return 1
    report = Report()
    items = load_sources(yaml.safe_load(args.sources.read_text()), args.raw, report)
    items = dedupe(inspect(items, report), report)
    if not items:
        print("No usable photos found.")
        print_summary(summarize([], {}), report)
        return 1

    manifest_path = args.out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    splits = assign_splits(items, manifest, args.seed)
    table = summarize(items, splits)
    print_summary(table, report)

    if args.dry_run:
        print("\nDry run: nothing written.")
        return 0

    write_dataset(items, splits, args.out, args.max_size)
    manifest.update(splits)
    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=1))
    (args.out / "report.json").write_text(
        json.dumps({"splits": table, "dropped": dict(report.dropped), "warnings": report.warnings}, indent=2)
    )
    print(f"\nWrote {len(items)} photos to {args.out}")
    if args.zip:
        archive = shutil.make_archive(str(args.out.parent / "dataset"), "zip", args.out.parent, args.out.name)
        print(f"Wrote {archive}. Upload it to Google Drive at MyDrive/pestblaster/dataset.zip")
    return 0


if __name__ == "__main__":
    sys.exit(main())
