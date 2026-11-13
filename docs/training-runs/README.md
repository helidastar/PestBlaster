# Pest Detector Training Runs

One row per training run, newest first. Put each run's files in a folder named by date
(`metrics.json`, `model_card.json`, `confusion_matrix.png`, `results.png`, and the `evaluate.py` result).
How to train: [`training/README.md`](../../training/README.md).

| Date | Photos (train / val / test) | Boxes per pest | Base model | Test mAP50 | Recall (larva / looper / aphids) | Suggested threshold | What changed |
|------|-----------------------------|----------------|------------|-----------|-----------------------------------|---------------------|--------------|
| 2026-11-13 | see `model_card.json` | ~840 / ~760 / ~1,450 (looper / larva / aphids, before clean-up) | YOLO11n | **0.913** | 0.938 / 0.940 / 0.794 | 0.24 | Baseline on public photos only (3 Roboflow copies, CC BY 4.0, `ROBOFLOW_SOURCES` in the notebook). Test split is public photos too, not our lettuce. [metrics](2026-11-13/metrics.json) |

Targets (documentation, Appendix C.3): mAP50 ≥ 0.70, recall ≥ 0.75 per pest (loopers reported separately).

### 2026-11-13 baseline: notes
- All targets met on the public test split: mAP50 0.913 (target 0.70); recall per pest 0.938 armyworm/cutworm, 0.940 looper, 0.794 aphid colony (target 0.75).
- Aphid colony is the weakest (precision 0.798, mAP50 0.858, mAP50-95 0.441): the public photos often box single aphids, while our label rule is one box per colony.
- Speed on the Colab T4: 10 ms inference per photo (19 ms with pre- and post-processing). Not the Pi 5 speed.
- This does not show how the model does on our turret's photos. The thesis number must come from our own lettuce photos in the test split.
