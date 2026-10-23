"""Use a model hosted on Roboflow (Serverless API) as the PestBlaster detector.

A stand-in until our own YOLO11n is trained: the app talks to it exactly like serve.py
(DETECTOR=http), so nothing in the app changes when we switch.

    export ROBOFLOW_API_KEY=...            # from https://app.roboflow.com/settings/api
    python training/roboflow_detector.py photo.jpg       # one photo: Roboflow reply + what the app gets
    python training/serve.py --roboflow pest-detection-qbalv/3   # serve it on port 8000

Needs internet (the Pi hotspot has none unless the pocket Wi-Fi router is connected).
Roboflow's class names are mapped to ours below; classes that are not one of our three
pests are dropped. Run one photo first and check the names it prints.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CLASSES  # noqa: E402

DEFAULT_MODEL = "pest-detection-qbalv/3"
API_URL = "https://serverless.roboflow.com"

# Roboflow class name (lower case, matched as a pattern) -> our class.
CLASS_PATTERNS: list[tuple[str, str]] = [
    (r"looper|trichoplusia", "looper"),
    (r"army ?worm|cut ?worm|spodoptera|agrotis", "armyworm_cutworm"),
    # pest-detection-qbalv/3 has one generic "Caterpillar" class and cannot tell a looper
    # from an armyworm, so its caterpillars count as armyworm/cutworm.
    (r"caterpillar|larva", "armyworm_cutworm"),
    (r"aphid", "aphid_colony"),
]


def map_class(name: str) -> str | None:
    n = name.strip().lower().replace("_", " ").replace("-", " ")
    for pattern, ours in CLASS_PATTERNS:
        if re.search(pattern, n):
            return ours
    return None


def to_rows(result: dict[str, Any], min_conf: float = 0.0):
    """Roboflow reply (centre x/y, width/height in pixels) -> serve.py rows (x1, y1, x2, y2 as fractions, class id, conf)."""
    img = result.get("image") or {}
    w, h = float(img.get("width") or 0), float(img.get("height") or 0)
    if w <= 0 or h <= 0:
        return
    for p in result.get("predictions", []):
        ours = map_class(str(p.get("class", "")))
        conf = float(p.get("confidence", 0))
        if ours is None or conf < min_conf:
            continue
        cx, cy, bw, bh = (float(p[k]) for k in ("x", "y", "width", "height"))
        yield (cx - bw / 2) / w, (cy - bh / 2) / h, (cx + bw / 2) / w, (cy + bh / 2) / h, CLASSES.index(ours), conf


def make_client(api_key: str | None = None):
    from inference_sdk import InferenceConfiguration, InferenceHTTPClient

    key = api_key or os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        raise SystemExit("Set ROBOFLOW_API_KEY (https://app.roboflow.com/settings/api).")
    # Header auth (inference-sdk 1.5.0+): the key never goes in the URL.
    return InferenceHTTPClient(api_url=API_URL, api_key=key).configure(
        InferenceConfiguration(api_key_transport="header")
    )


def roboflow_predictor(model_id: str, min_conf: float, client=None) -> tuple[Callable[[Image.Image], Any], dict]:
    client = client or make_client()

    def predict(img: Image.Image):
        return to_rows(client.infer(img, model_id=model_id), min_conf)

    return predict, {"model": f"roboflow:{model_id}", "classes": CLASSES, "min_confidence": min_conf}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", help="photo path or URL")
    ap.add_argument("--model", default=os.environ.get("ROBOFLOW_MODEL", DEFAULT_MODEL))
    ap.add_argument("--min-conf", type=float, default=0.2)
    a = ap.parse_args(argv)

    from serve import to_detections

    image = a.image
    if not image.startswith(("http://", "https://")):
        path = Path(image.strip().strip('"'))
        if not path.is_file():
            raise SystemExit(f"Photo not found: {path}. Drag a real photo into the terminal to paste its path.")
        image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")

    result = make_client().infer(image, model_id=a.model)
    names = sorted({str(p.get("class")) for p in result.get("predictions", [])})
    print("Roboflow classes in this photo:", ", ".join(f"{n} -> {map_class(n) or 'dropped'}" for n in names) or "none")
    print(json.dumps({"detections": to_detections(to_rows(result, a.min_conf))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
