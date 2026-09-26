"""Measure a running detector the way the turret uses it (testing strategy B.1).

    python training/serve.py --model training/models/best.pt        # terminal 1
    python training/evaluate.py --url http://localhost:8000/detect   # terminal 2

Sends every photo of the locked test split to the detector over HTTP, compares the
answers with the hand-drawn labels, and reports for each pest:
  - precision (of the sprays it would make, how many hit a real pest)
  - recall    (of the real pests, how many it finds)
  - F1, at each confidence threshold the app can be set to
  - how far the box center is from the real pest (this is where the turret aims)
  - time per photo, including the network round trip

Results are saved to training/runs/eval-<date-time>.json for the thesis.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CLASSES, DATASET_DIR, IMAGE_EXTS, RUNS_DIR  # noqa: E402

THRESHOLDS = [round(0.2 + 0.05 * i, 2) for i in range(16)]  # 0.20 ... 0.95


@dataclass
class Box:
    cls: int
    x: float  # left
    y: float  # top
    w: float
    h: float
    conf: float = 1.0

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.w / 2, self.y + self.h / 2


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    iy = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    inter = ix * iy
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union > 0 else 0.0


def read_truth(label: Path) -> list[Box]:
    """YOLO label lines (class cx cy w h) as top-left boxes."""
    boxes = []
    if label.exists():
        for line in label.read_text().splitlines():
            p = line.split()
            if len(p) == 5:
                c, cx, cy, w, h = int(p[0]), *map(float, p[1:])
                boxes.append(Box(c, cx - w / 2, cy - h / 2, w, h))
    return boxes


def parse_reply(body: dict) -> list[Box]:
    out = []
    for d in body.get("detections", []):
        if d.get("pest") in CLASSES:
            b = d["bbox"]
            out.append(Box(CLASSES.index(d["pest"]), b["x"], b["y"], b["w"], b["h"], float(d["confidence"])))
    return out


def match(truth: list[Box], preds: list[Box], threshold: float, iou_min: float):
    """Greedy match by confidence. Returns per-class tp, fp, fn and center errors of matches."""
    tp = [0] * len(CLASSES)
    fp = [0] * len(CLASSES)
    fn = [0] * len(CLASSES)
    errors: list[float] = []
    used = set()
    for p in sorted((p for p in preds if p.conf >= threshold), key=lambda p: -p.conf):
        best, best_iou = None, iou_min
        for i, t in enumerate(truth):
            if i in used or t.cls != p.cls:
                continue
            v = iou(p, t)
            if v >= best_iou:
                best, best_iou = i, v
        if best is None:
            fp[p.cls] += 1
        else:
            used.add(best)
            tp[p.cls] += 1
            (px, py), (tx, ty) = p.center, truth[best].center
            errors.append(((px - tx) ** 2 + (py - ty) ** 2) ** 0.5)
    for i, t in enumerate(truth):
        if i not in used:
            fn[t.cls] += 1
    return tp, fp, fn, errors


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return {"precision": round(p, 3), "recall": round(r, 3), "f1": round(f1, 3), "tp": tp, "fp": fp, "fn": fn}


def score(results: list[tuple[list[Box], list[Box]]], iou_min: float = 0.5) -> dict:
    """results = [(truth, predictions)] per photo."""
    table = {}
    for thr in THRESHOLDS:
        tp = [0] * len(CLASSES)
        fp = [0] * len(CLASSES)
        fn = [0] * len(CLASSES)
        errors: list[float] = []
        false_spray_photos = 0
        for truth, preds in results:
            a, b, c, e = match(truth, preds, thr, iou_min)
            tp = [x + y for x, y in zip(tp, a)]
            fp = [x + y for x, y in zip(fp, b)]
            fn = [x + y for x, y in zip(fn, c)]
            errors += e
            if not truth and any(p.conf >= thr for p in preds):
                false_spray_photos += 1
        table[thr] = {
            "per_class": {c: prf(tp[i], fp[i], fn[i]) for i, c in enumerate(CLASSES)},
            "overall": prf(sum(tp), sum(fp), sum(fn)),
            "false_spray_on_no_pest_photos": false_spray_photos,
            "center_error_mean": round(statistics.mean(errors), 4) if errors else None,
        }
    best_thr = max(THRESHOLDS, key=lambda t: (table[t]["overall"]["f1"], t))
    return {"by_threshold": table, "best_threshold": best_thr}


def post(url: str, data: bytes, content_type: str, timeout: float) -> dict:
    req = urllib.request.Request(url, data=data, headers={"content-type": content_type}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8000/detect")
    ap.add_argument("--dataset", type=Path, default=DATASET_DIR)
    ap.add_argument("--split", default="test", choices=["train", "val", "test"])
    ap.add_argument("--iou", type=float, default=0.5, help="box overlap needed to count as found (default 0.5)")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--timeout", type=float, default=30)
    a = ap.parse_args(argv)

    img_dir = a.dataset / "images" / a.split
    photos = sorted(p for p in img_dir.glob("*") if p.suffix.lower() in IMAGE_EXTS)
    if not photos:
        print(f"No photos in {img_dir}. Run prepare_dataset.py first.")
        return 1

    # One untimed request first: the model's first run is slow (loading), not typical.
    try:
        post(a.url, photos[0].read_bytes(), "image/png" if photos[0].suffix.lower() == ".png" else "image/jpeg", a.timeout)
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"Could not reach the detector at {a.url}: {e}. Is serve.py running?")
        return 1

    results, times = [], []
    for i, photo in enumerate(photos, 1):
        ctype = "image/png" if photo.suffix.lower() == ".png" else "image/jpeg"
        start = time.perf_counter()
        try:
            reply = post(a.url, photo.read_bytes(), ctype, a.timeout)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"Could not reach the detector at {a.url}: {e}. Is serve.py running?")
            return 1
        times.append((time.perf_counter() - start) * 1000)
        results.append((read_truth(a.dataset / "labels" / a.split / f"{photo.stem}.txt"), parse_reply(reply)))
        print(f"\r{i}/{len(photos)} photos", end="", flush=True)
    print()

    report = score(results, a.iou)
    times.sort()
    report.update({
        "url": a.url, "split": a.split, "photos": len(photos), "iou": a.iou,
        "ms_per_photo": {
            "mean": round(statistics.mean(times), 1),
            "median": round(statistics.median(times), 1),
            "p95": round(times[min(len(times) - 1, int(0.95 * len(times)))], 1),
        },
        "measured_at": time.strftime("%Y-%m-%d %H:%M"),
    })

    best = report["best_threshold"]
    row = report["by_threshold"][best]
    print(f"\nBest confidence threshold: {best:.2f} (highest overall F1)\n")
    print(f"{'pest':20s} {'precision':>9s} {'recall':>7s} {'F1':>6s} {'found':>6s} {'missed':>7s} {'wrong':>6s}")
    for c in CLASSES:
        m = row["per_class"][c]
        print(f"{c:20s} {m['precision']:>9.3f} {m['recall']:>7.3f} {m['f1']:>6.3f} {m['tp']:>6d} {m['fn']:>7d} {m['fp']:>6d}")
    o = row["overall"]
    print(f"{'all pests':20s} {o['precision']:>9.3f} {o['recall']:>7.3f} {o['f1']:>6.3f} {o['tp']:>6d} {o['fn']:>7d} {o['fp']:>6d}")
    print(f"\nSprays on photos with no pest: {row['false_spray_on_no_pest_photos']}")
    if row["center_error_mean"] is not None:
        print(f"Average aim error (box center): {row['center_error_mean'] * 100:.1f}% of the photo width")
    t = report["ms_per_photo"]
    print(f"Time per photo: {t['median']} ms median, {t['mean']} ms average, {t['p95']} ms for the slowest 5%")

    out = a.out or RUNS_DIR / f"eval-{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(f"\nSaved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
