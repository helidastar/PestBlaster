"""Draw a small synthetic pest dataset for checking the training pipeline.

    python training/make_smoke_dataset.py --out /tmp/smoke

It makes cartoon lettuce leaves with cartoon pests, in the same folder layout as a
Roboflow YOLO export, plus a sources.yaml. A model trained on it is USELESS on real
photos: it only proves that preparing, training, exporting, serving and evaluating
all fit together before you spend Colab time on the real dataset.
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw

# Deliberately different names from ours, to exercise the class mapping.
SOURCE_NAMES = ["Diamondback Moth", "Cabbage Looper", "Aphid", "Armyworm"]
SIZE = {0: (0.10, 0.06), 1: (0.14, 0.08), 2: (0.16, 0.13), 3: (0.12, 0.07)}


def draw_leaf(d: ImageDraw.ImageDraw, w: int, h: int, rng: random.Random, under: bool) -> None:
    leaf = (140, 185, 105) if under else (100, 170, 70)
    vein = (205, 225, 180) if under else (170, 210, 125)
    d.ellipse([w * 0.05, h * 0.04, w * 0.95, h * 0.98], fill=leaf)
    d.line([w * 0.5, h * 0.98, w * 0.5, h * 0.05], fill=vein, width=6)
    for i in range(7):
        y = h * (0.15 + i * 0.11)
        d.line([w * 0.5, y + h * 0.06, w * 0.15, y - h * 0.05 + rng.uniform(-8, 8)], fill=vein, width=3)
        d.line([w * 0.5, y + h * 0.06, w * 0.85, y - h * 0.05 + rng.uniform(-8, 8)], fill=vein, width=3)


def draw_pest(d: ImageDraw.ImageDraw, cls: int, x0: float, y0: float, bw: float, bh: float, rng: random.Random) -> None:
    if cls in (0, 3):  # larva / armyworm: segmented capsule
        color = (190, 220, 140) if cls == 0 else (110, 95, 70)
        for i in range(5):
            cx = x0 + (i + 0.5) * bw / 5
            d.ellipse([cx - bw / 9, y0 + bh * 0.1, cx + bw / 9, y0 + bh * 0.9], fill=color, outline=(90, 120, 60))
        d.ellipse([x0 + bw - bh * 0.4, y0 + bh * 0.3, x0 + bw, y0 + bh * 0.7], fill=(100, 80, 50))
    elif cls == 1:  # looper: arched body
        d.arc([x0, y0, x0 + bw, y0 + bh * 2], 180, 360, fill=(135, 195, 100), width=max(3, int(bh / 2.5)))
    else:  # aphid cluster: many small dots
        for _ in range(22):
            cx, cy = x0 + rng.uniform(0.1, 0.9) * bw, y0 + rng.uniform(0.1, 0.9) * bh
            d.ellipse([cx - 4, cy - 3, cx + 4, cy + 3], fill=(160, 200, 80), outline=(80, 110, 40))


def make(out: Path, n: int, negatives: int, seed: int) -> None:
    rng = random.Random(seed)
    src = out / "raw" / "smoke-pests"
    for sub in ("images", "labels"):
        (src / sub).mkdir(parents=True, exist_ok=True)
    (src / "data.yaml").write_text("names: [" + ", ".join(f"'{s}'" for s in SOURCE_NAMES) + "]\n")
    W, H = 480, 360
    for i in range(n):
        img = Image.new("RGB", (W, H), (60, 47, 34))
        d = ImageDraw.Draw(img)
        draw_leaf(d, W, H, rng, under=rng.random() < 0.4)
        lines = []
        for _ in range(rng.choice([1, 1, 2])):
            cls = rng.randrange(4)
            bw, bh = SIZE[cls]
            x, y = rng.uniform(0.1, 0.9 - bw), rng.uniform(0.1, 0.9 - bh)
            draw_pest(d, cls, x * W, y * H, bw * W, bh * H, rng)
            lines.append(f"{cls} {x + bw / 2:.5f} {y + bh / 2:.5f} {bw:.5f} {bh:.5f}")
        plant = f"plant{i // 4:02d}"  # 4 photos per plant, to exercise group splitting
        img.save(src / "images" / f"{plant}_{i:03d}.jpg", quality=90)
        (src / "labels" / f"{plant}_{i:03d}.txt").write_text("\n".join(lines) + "\n")

    neg = out / "raw" / "smoke-healthy"
    neg.mkdir(parents=True, exist_ok=True)
    for i in range(negatives):
        img = Image.new("RGB", (W, H), (60, 47, 34))
        draw_leaf(ImageDraw.Draw(img), W, H, rng, under=rng.random() < 0.4)
        img.save(neg / f"healthy_{i:03d}.jpg", quality=90)

    (out / "sources.yaml").write_text(
        "sources:\n"
        "  smoke-pests:\n"
        "    map:\n"
        "      diamondback moth: diamondback_larva\n"
        "      cabbage looper: looper\n"
        "      aphid: aphid_cluster\n"
        "      armyworm: null\n"
        "    group: '^(plant\\d+)_'\n"
        "  smoke-healthy:\n"
        "    negatives: true\n"
    )
    print(f"Wrote {n} pest photos and {negatives} healthy photos to {out}/raw, and {out}/sources.yaml")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--negatives", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    make(a.out, a.n, a.negatives, a.seed)
