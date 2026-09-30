"""Shared constants for the PestBlaster training tools."""
from pathlib import Path

# Must match PEST_TYPES in src/lib/pests.ts, in the same order.
# The order is the model's class id: 0, 1, 2.
CLASSES = ["diamondback_larva", "looper", "aphid_cluster"]

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "raw"
DATASET_DIR = ROOT / "dataset"
RUNS_DIR = ROOT / "runs"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SPLITS = ("train", "val", "test")
