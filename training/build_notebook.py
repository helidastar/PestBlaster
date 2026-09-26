"""Writes pestblaster_detector_colab.ipynb from the cells below.

Edit the cells here, then run:  python training/build_notebook.py
Keeping the source as plain Python makes notebook changes easy to review in pull requests.
"""
import json
from pathlib import Path

CELLS: list[tuple[str, str]] = [
    ("markdown", """# PestBlaster — Pest Detector Training (Colab)

Trains a small **YOLO** object detector to find the three lettuce pests and draw a box around each one,
so the turret knows where to aim. The trained model is then served to the PestBlaster app through
`DETECTOR=http` (see `training/README.md`, section 5).

| Class id | Name |
|---|---|
| 0 | `diamondback_larva` |
| 1 | `looper` |
| 2 | `aphid_cluster` |

**Before you start**
1. `Runtime → Change runtime type → T4 GPU`
2. Build the dataset on a laptop with `python training/prepare_dataset.py --zip`
3. Upload `training/dataset.zip` to Google Drive at `MyDrive/pestblaster/dataset.zip`

Then `Runtime → Run all`. Results are saved to `MyDrive/pestblaster/runs/<date-time>/`."""),

    ("markdown", "## 1. Settings"),
    ("code", """import os, sys

DRIVE_ZIP  = '/content/drive/MyDrive/pestblaster/dataset.zip'
OUT_ROOT   = '/content/drive/MyDrive/pestblaster/runs'
BASE_MODEL = 'yolo11n.pt'   # small and fast; try 'yolo11s.pt' if accuracy is too low
EPOCHS     = 150
PATIENCE   = 30             # stop early when validation stops improving for this many epochs
IMGSZ      = 640
BATCH      = 16
SEED       = 42

# Must match PEST_TYPES in src/lib/pests.ts, in the same order.
EXPECTED_CLASSES = ['diamondback_larva', 'looper', 'aphid_cluster']

# Acceptance targets from the documentation (Appendix C.3). Confirm them with the adviser.
TARGET_MAP50 = 0.70
TARGET_RECALL = 0.75

# Outside Colab (for testing on a laptop) these come from environment variables instead.
IN_COLAB = 'google.colab' in sys.modules
if not IN_COLAB:
    EPOCHS = int(os.environ.get('PB_EPOCHS', EPOCHS))
    IMGSZ = int(os.environ.get('PB_IMGSZ', IMGSZ))
    BATCH = int(os.environ.get('PB_BATCH', BATCH))
    BASE_MODEL = os.environ.get('PB_BASE_MODEL', BASE_MODEL)
print('Colab' if IN_COLAB else 'Local run', '| epochs', EPOCHS, '| image size', IMGSZ)"""),

    ("markdown", "## 2. Mount Drive, unzip the dataset, install YOLO"),
    ("code", """import glob, subprocess, zipfile

if IN_COLAB:
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'ultralytics'], check=True)
    from google.colab import drive
    drive.mount('/content/drive')

    # The expected path first, then anywhere in Drive.
    zip_path = DRIVE_ZIP if os.path.exists(DRIVE_ZIP) else None
    if not zip_path:
        found = sorted(glob.glob('/content/drive/MyDrive/**/dataset*.zip', recursive=True))
        if not found:
            print('Top level of MyDrive:', sorted(os.listdir('/content/drive/MyDrive'))[:40])
            raise FileNotFoundError('No dataset zip found. Upload dataset.zip to ' + DRIVE_ZIP)
        zip_path = found[0]
        print('Using', zip_path)
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall('/content')
    except zipfile.BadZipFile:
        raise RuntimeError(zip_path + ' is not a valid zip. Wait for the Drive upload to finish, then re-run.')
    DATA_DIR = '/content/dataset'
else:
    DATA_DIR = os.environ['PB_DATASET']
    OUT_ROOT = os.environ.get('PB_OUT', 'runs')

assert os.path.exists(os.path.join(DATA_DIR, 'data.yaml')), 'data.yaml not found in ' + DATA_DIR
print('Dataset:', DATA_DIR)"""),

    ("markdown", "## 3. Check the dataset"),
    ("code", """import collections, json, time, yaml

with open(os.path.join(DATA_DIR, 'data.yaml')) as f:
    spec = yaml.safe_load(f)
names = spec['names']
names = [names[k] for k in sorted(names)] if isinstance(names, dict) else names
assert names == EXPECTED_CLASSES, f'Class names/order {names} do not match {EXPECTED_CLASSES}'

counts = {}
for split in ('train', 'val', 'test'):
    boxes, photos, empty = collections.Counter(), 0, 0
    for lbl in glob.glob(os.path.join(DATA_DIR, 'labels', split, '*.txt')):
        photos += 1
        lines = [l for l in open(lbl).read().splitlines() if l.strip()]
        empty += not lines
        for l in lines:
            boxes[EXPECTED_CLASSES[int(l.split()[0])]] += 1
    counts[split] = {'photos': photos, 'no_pest_photos': empty, **{c: boxes[c] for c in EXPECTED_CLASSES}}
    print(f'{split:5s}', counts[split])
assert counts['test']['photos'] > 0, 'The test split is empty. Add more photos before training.'
for c in EXPECTED_CLASSES:
    total = sum(counts[s][c] for s in counts)
    if total < 300:
        print(f'WARNING: only {total} {c} boxes; aim for 300+ or accuracy will be weak')

RUN_DIR = os.path.abspath(os.path.join(OUT_ROOT, time.strftime('%Y%m%d-%H%M%S')))
os.makedirs(RUN_DIR, exist_ok=True)

# YOLO resolves relative dataset paths against its own settings folder, so write an absolute copy.
DATA_YAML = os.path.join(RUN_DIR, 'data.yaml')
with open(DATA_YAML, 'w') as f:
    yaml.safe_dump({**spec, 'path': os.path.abspath(DATA_DIR)}, f, sort_keys=False)
print('Saving to', RUN_DIR)"""),

    ("markdown", """## 4. Train
Starts from weights pretrained on everyday objects (COCO) and fine-tunes them on our pests.
`flipud` flips photos upside down too, because the camera also looks up at leaf undersides."""),
    ("code", """from ultralytics import YOLO, __version__ as YOLO_VERSION

model = YOLO(BASE_MODEL)
model.train(
    data=DATA_YAML, epochs=EPOCHS, patience=PATIENCE, imgsz=IMGSZ, batch=BATCH, seed=SEED,
    project=RUN_DIR, name='train', exist_ok=True,
    flipud=0.5, fliplr=0.5, degrees=15,
    plots=True, verbose=False,
)
BEST = os.path.join(RUN_DIR, 'train', 'weights', 'best.pt')
print('Best weights:', BEST)"""),

    ("markdown", """## 5. Evaluate on the locked test set
The test photos were never used for training or for choosing the best epoch, so these are the honest
numbers for the thesis (testing strategy B.1: accuracy per pest type)."""),
    ("code", """import numpy as np

best = YOLO(BEST)
res = best.val(data=DATA_YAML, split='test', imgsz=IMGSZ, batch=BATCH,
               project=RUN_DIR, name='test', exist_ok=True, plots=True, verbose=False)

per_class = {}
for i, c in enumerate(EXPECTED_CLASSES):
    if i in list(res.box.ap_class_index):
        p, r, ap50, ap = res.box.class_result(list(res.box.ap_class_index).index(i))
        per_class[c] = {'precision': round(float(p), 3), 'recall': round(float(r), 3),
                        'mAP50': round(float(ap50), 3), 'mAP50_95': round(float(ap), 3)}
    else:
        per_class[c] = None  # no boxes of this pest in the test split

# Confidence where the average F1 over the three pests is highest: a good starting value
# for "Only spray when at least ...% sure" in the app.
f1 = np.asarray(res.box.f1_curve)
best_conf = None
if f1.size and f1.mean(0).max() > 0.05:  # no useful threshold if the model finds almost nothing
    best_conf = float(res.box.px[int(f1.mean(0).argmax())])

metrics = {
    'overall': {'precision': round(float(res.box.mp), 3), 'recall': round(float(res.box.mr), 3),
                'mAP50': round(float(res.box.map50), 3), 'mAP50_95': round(float(res.box.map), 3)},
    'per_class': per_class,
    'suggested_confidence_threshold': round(best_conf, 2) if best_conf is not None else None,
    'speed_ms_per_image': {k: round(v, 1) for k, v in res.speed.items()},
}
print(json.dumps(metrics, indent=2))

ok_map = metrics['overall']['mAP50'] >= TARGET_MAP50
ok_recall = all(v is None or v['recall'] >= TARGET_RECALL for v in per_class.values())
print('mAP50  ', 'PASS' if ok_map else 'BELOW TARGET', f'(target {TARGET_MAP50})')
print('recall ', 'PASS' if ok_recall else 'BELOW TARGET for at least one pest', f'(target {TARGET_RECALL})')"""),

    ("markdown", "## 6. Export and save the model card"),
    ("code", """import shutil

EXPORT_DIR = os.path.join(RUN_DIR, 'export')
os.makedirs(EXPORT_DIR, exist_ok=True)
shutil.copy(BEST, os.path.join(EXPORT_DIR, 'best.pt'))
onnx_path = best.export(format='onnx', imgsz=IMGSZ)
shutil.copy(onnx_path, os.path.join(EXPORT_DIR, 'best.onnx'))

card = {
    'trained_at': time.strftime('%Y-%m-%d %H:%M'),
    'base_model': BASE_MODEL, 'ultralytics_version': YOLO_VERSION,
    'epochs_requested': EPOCHS, 'image_size': IMGSZ, 'seed': SEED,
    'classes': EXPECTED_CLASSES, 'dataset': counts, 'test_metrics': metrics,
}
with open(os.path.join(EXPORT_DIR, 'model_card.json'), 'w') as f:
    json.dump(card, f, indent=2)
with open(os.path.join(RUN_DIR, 'metrics.json'), 'w') as f:
    json.dump(metrics, f, indent=2)
print('Saved to', EXPORT_DIR, sorted(os.listdir(EXPORT_DIR)))"""),

    ("markdown", """## 7. Next steps
1. Download `export/best.pt` and `export/model_card.json` to `training/models/` on the laptop.
2. Copy `metrics.json`, `test/confusion_matrix.png` and `train/results.png` into
   `docs/training-runs/<date>/` and record the run in `docs/training-runs/README.md`.
3. Start the model server and point the app at it (`training/README.md`, section 5).
4. Run `training/evaluate.py` to measure the model through the same connection the turret uses."""),
]


def build() -> dict:
    cells = []
    for kind, src in CELLS:
        cell = {"cell_type": kind, "metadata": {}, "source": src.splitlines(keepends=True)}
        if kind == "code":
            cell.update(execution_count=None, outputs=[])
        cells.append(cell)
    return {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {"provenance": [], "gpuType": "T4"},
            "kernelspec": {"display_name": "Python 3", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 0,
    }


def code_only() -> str:
    """All code cells joined, for running the notebook as a plain script in tests."""
    return "\n\n".join(src for kind, src in CELLS if kind == "code")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "pestblaster_detector_colab.ipynb"
    out.write_text(json.dumps(build(), indent=1) + "\n")
    print(f"Wrote {out}")
