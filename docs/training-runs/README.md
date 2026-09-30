# Pest Detector Training Runs

One row per training run, newest first. Put each run's files in a folder named by date
(`metrics.json`, `model_card.json`, `confusion_matrix.png`, `results.png`, and the `evaluate.py` result).
How to train: [`training/README.md`](../../training/README.md).

| Date | Photos (train / val / test) | Boxes per pest | Base model | Test mAP50 | Recall (larva / looper / aphids) | Suggested threshold | What changed |
|------|-----------------------------|----------------|------------|-----------|-----------------------------------|---------------------|--------------|
| — | — | — | — | — | — | — | First real run pending: dataset collection and labeling in progress |

Targets (documentation, Appendix C.3): mAP50 ≥ 0.70, recall ≥ 0.75 per pest (loopers reported separately).
