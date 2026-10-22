"""Model server for the PestBlaster app. The app uses it when DETECTOR=http.

    python training/serve.py --model training/models/best.pt           # port 8000
    # then in .env.local:  DETECTOR=http  and  DETECTOR_URL=http://localhost:8000/detect

POST /detect   body = raw JPEG/PNG bytes
               reply = {"detections": [{"pest", "confidence", "bbox": {x, y, w, h}}], ...}
               Box values are fractions of the photo (0-1), origin top-left, the same
               contract as src/lib/detector/http.ts.
GET  /health   model file, classes and image size.

Runs on the team laptop or the field-test PC (a normal CPU is enough for YOLO11n).
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from pathlib import Path
from typing import Callable, Iterable, Sequence

from fastapi import FastAPI, HTTPException, Request
from PIL import Image, ImageOps, UnidentifiedImageError

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CLASSES, ROOT  # noqa: E402

# (image) -> rows of (x1, y1, x2, y2 as fractions, class id, confidence)
Predict = Callable[[Image.Image], Iterable[tuple[float, float, float, float, int, float]]]


def check_names(names: dict[int, str] | Sequence[str]) -> None:
    """The model's class list must be exactly ours, in our order."""
    got = [names[k] for k in sorted(names)] if isinstance(names, dict) else list(names)
    if got != CLASSES:
        raise SystemExit(f"Model classes {got} do not match {CLASSES}. Was it trained on the prepared dataset?")


def to_detections(rows: Iterable[tuple[float, float, float, float, int, float]]) -> list[dict]:
    out = []
    for x1, y1, x2, y2, cls, conf in rows:
        if not 0 <= int(cls) < len(CLASSES):
            continue
        x1, y1 = max(0.0, float(x1)), max(0.0, float(y1))
        x2, y2 = min(1.0, float(x2)), min(1.0, float(y2))
        if x2 <= x1 or y2 <= y1:
            continue
        out.append({
            "pest": CLASSES[int(cls)],
            "confidence": round(float(conf), 4),
            "bbox": {"x": round(x1, 4), "y": round(y1, 4), "w": round(x2 - x1, 4), "h": round(y2 - y1, 4)},
        })
    return sorted(out, key=lambda d: -d["confidence"])


def create_app(predict: Predict, info: dict) -> FastAPI:
    app = FastAPI(title="PestBlaster model server")

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, **info}

    @app.post("/detect")
    async def detect(request: Request) -> dict:
        body = await request.body()
        if not body:
            raise HTTPException(400, "Send the photo bytes as the request body.")
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(body))).convert("RGB")
        except (UnidentifiedImageError, OSError):
            raise HTTPException(400, "The body is not a JPEG or PNG photo.")
        start = time.perf_counter()
        detections = to_detections(predict(img))
        return {"detections": detections, "ms": round((time.perf_counter() - start) * 1000, 1)}

    return app


def yolo_predictor(model_path: str, imgsz: int, min_conf: float) -> tuple[Predict, dict]:
    from ultralytics import YOLO

    model = YOLO(model_path, task="detect")
    check_names(model.names)

    def predict(img: Image.Image):
        res = model.predict(img, imgsz=imgsz, conf=min_conf, verbose=False)[0]
        boxes = res.boxes
        for (x1, y1, x2, y2), cls, conf in zip(boxes.xyxyn.tolist(), boxes.cls.tolist(), boxes.conf.tolist()):
            yield x1, y1, x2, y2, int(cls), conf

    return predict, {"model": str(model_path), "classes": CLASSES, "image_size": imgsz, "min_confidence": min_conf}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=os.environ.get("PB_MODEL", str(ROOT / "models" / "best.pt")))
    ap.add_argument("--imgsz", type=int, default=int(os.environ.get("PB_IMGSZ", 640)))
    # Low on purpose: the app applies the grower's own threshold ("Only spray when at least ...% sure").
    ap.add_argument("--min-conf", type=float, default=float(os.environ.get("PB_MIN_CONF", 0.2)))
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    if not Path(a.model).exists():
        raise SystemExit(f"Model file {a.model} not found. Download best.pt from the Colab run into training/models/.")

    import uvicorn

    predict, info = yolo_predictor(a.model, a.imgsz, a.min_conf)
    print(f"Serving {a.model} on http://{a.host}:{a.port}/detect")
    uvicorn.run(create_app(predict, info), host=a.host, port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
