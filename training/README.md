# Training the PestBlaster Pest Detector

How to collect and label photos, build the dataset, train the model in Google Colab, and connect it to the app.
Everything here is free: public datasets, our own photos, Google Colab, and the team laptop.

**Related:** notebook → [`pestblaster_detector_colab.ipynb`](pestblaster_detector_colab.ipynb) · plan and targets → [documentation, Appendix C](../docs/DOCUMENTATION.md#appendix-c--pest-detection-model-plan)

## How the pieces fit

```
photos (public + ours) ──label──▶ training/raw/
        │  python training/prepare_dataset.py --zip
        ▼
training/dataset.zip ──upload──▶ Google Drive ──▶ Colab notebook (T4 GPU) ──▶ best.pt + metrics
                                                                                   │ download
                                                                                   ▼
ESP32-S3 turret ──photo──▶ Next.js app (DETECTOR=http) ──▶ training/serve.py (best.pt) on the laptop
```

The model is a **YOLO object detector** (YOLO11n). A classifier would only say *which* pest is in the photo; the turret also needs *where* it is, to aim. YOLO returns a box per pest, and the app aims at the box center.

| Class id | Name | Label rule |
|---|---|---|
| 0 | `diamondback_larva` | One box per larva, tight around the body |
| 1 | `looper` | One box per looper, including the arched part |
| 2 | `aphid_cluster` | One box around each **group** of aphids (not one per aphid). A single isolated aphid gets its own box. |

The order must match `PEST_TYPES` in `src/lib/pests.ts` (a test checks this).

## Setup (laptop, once)

Needs Python 3.10 or newer.

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r training/requirements.txt
```

## 1. Where to get photos

Read each dataset's license before use; most allow academic use only, which fits a thesis. Always look at the photos, not just the labels: many public pest photos are from other crops or are close-ups on white backgrounds, unlike what the turret camera sees.

| Source | What to take | Notes |
|---|---|---|
| **Our own photos** (most important) | All three pests on real lettuce, leaf tops **and undersides**, at 10–20 cm, morning / noon / late afternoon | These match what the turret will see. Aim for at least half of the dataset. |
| [Roboflow Universe](https://universe.roboflow.com) | Search "aphid", "diamondback moth", "plutella", "cabbage looper", "caterpillar" | Many are already labeled with boxes. Export as **YOLOv8**. Check each dataset's license and class names. |
| [IP102](https://github.com/xpwu95/IP102) | Its detection subset has bounding boxes for 102 insect pests | Check its class list for aphids, loopers and diamondback moth, and use only those. Academic use. |
| [iNaturalist](https://www.inaturalist.org) | Research-grade observations of *Plutella xylostella*, *Trichoplusia ni*, aphids | Real field photos, but no boxes: they must be labeled by us. Keep only CC-BY / CC0 photos and credit them. |
| **No-pest photos** | Healthy lettuce, bite holes without a pest, water drops, soil, bird droppings, leaf veins | Teaches the model when **not** to spray. Aim for about 10–20% of the dataset. |

### Taking our own photos
- Use the turret camera (OV5640) once it works; until then a phone at the same distance is fine.
- Name files `plantNN_<anything>.jpg`, for example `plant07_under_02.jpg`. Every photo of the same plant then stays in the same split, so the test score is honest.
- Take several angles of the same pest, not the same shot twice.
- Never put a pest on the leaf by hand for a photo without noting it; staged photos are fine but say so in the thesis.

### Labeling
Use [Roboflow](https://roboflow.com) (free, in the browser), [Label Studio](https://labelstud.io) or [CVAT](https://www.cvat.ai). Draw rectangles (not polygons) and export in **YOLO** format. Rules:
- Box the whole visible pest, tight, no big margins.
- Box a pest that is more than half visible; skip ones hidden almost completely under a leaf.
- When unsure which pest it is, leave it out rather than guess.
- Two people label; the third checks 10% of each person's photos.

**Target:** at least 300 boxes per pest (the script shows how many are missing). 1,000+ is better.

## 2. Build the dataset

1. Put each labeled export in its own folder under `training/raw/`, e.g. `training/raw/roboflow-aphids/`. No-pest photos go in their own folder, e.g. `training/raw/healthy-leaves/`.
2. Copy `training/sources.example.yaml` to `training/sources.yaml` and describe each folder: how its class names map to ours, which to drop, and which folder is no-pest photos.
3. Check first (writes nothing):
   ```bash
   python training/prepare_dataset.py --dry-run
   ```
4. Build it and make the zip for Colab:
   ```bash
   python training/prepare_dataset.py --zip
   ```

The script:
- renames source classes to ours and drops the others (a photo with only other species is left out);
- removes unreadable and tiny photos and broken labels;
- removes copies of the same photo with the same labels (resized or re-saved copies too), keeping the largest; copies with **different** labels are all kept and listed for you to check;
- shrinks photos to 1280 px on the longest side (`--max-size`);
- splits **70 / 20 / 10** into train / val / test, keeping each plant (the `group` in `sources.yaml`) in one split;
- remembers every photo's split in `training/dataset/manifest.json`, so when you add photos later, test photos **stay** in test.

`training/raw/`, `training/dataset/`, `dataset.zip`, `training/runs/` and `training/models/` are git-ignored. Share photos through Google Drive, not the repository.

## 3. Train in Colab

1. Upload `training/dataset.zip` to Google Drive at `MyDrive/pestblaster/dataset.zip`.
2. Open [`pestblaster_detector_colab.ipynb`](pestblaster_detector_colab.ipynb) in Colab (File → Upload notebook, or open it from GitHub).
3. `Runtime → Change runtime type → T4 GPU`, then `Runtime → Run all`.

It checks the dataset, trains YOLO11n (up to 150 epochs, stopping early when it stops improving), evaluates on the **locked test split**, suggests a confidence threshold, and saves everything to `MyDrive/pestblaster/runs/<date-time>/`:

| File | What it is |
|---|---|
| `export/best.pt` | The trained model (for `serve.py`) |
| `export/best.onnx` | Same model in ONNX format |
| `export/model_card.json` | Dataset counts, settings and test results of this run |
| `metrics.json` | Test precision, recall and mAP per pest |
| `test/confusion_matrix.png`, `train/results.png` | Charts for the thesis |

A run of about 1,000 photos takes roughly 20–40 minutes on the free T4.

To change the notebook, edit `training/build_notebook.py` and run `python training/build_notebook.py`, so changes are readable in pull requests.

## 4. Connect the model to the app

On the team laptop (or the field-test PC):

1. Put the downloaded `best.pt` in `training/models/best.pt`.
2. Start the model server:
   ```bash
   python training/serve.py --model training/models/best.pt
   ```
3. In `.env.local` set:
   ```
   DETECTOR=http
   DETECTOR_URL=http://localhost:8000/detect
   ```
4. Restart the app (`npm run dev` or `npm start`).
5. With no turret yet, feed it real photos through the simulator:
   ```bash
   npm run simulate -- --photos training/dataset/images/test
   ```
   The drawn cartoon leaves only work with `DETECTOR=simulated`.

The server keeps every detection at 20% confidence or higher; the app's own setting ("Only spray when at least …% sure") decides when to spray. Set that from the threshold the notebook or `evaluate.py` suggests.

## 5. Measure it (testing strategy B.1)

With `serve.py` running:

```bash
python training/evaluate.py --url http://localhost:8000/detect
```

It sends every test photo through the same HTTP connection the app uses and reports, per pest: precision, recall, F1 at every threshold from 0.20 to 0.95, sprays on no-pest photos, aim error (distance between the predicted and true pest center), and time per photo. Results go to `training/runs/eval-<date-time>.json`.

## 6. Record each run

Copy `metrics.json`, `model_card.json`, `test/confusion_matrix.png`, `train/results.png` and the `evaluate.py` result into `docs/training-runs/<date>/`, and add a row to [`docs/training-runs/README.md`](../docs/training-runs/README.md) with what changed since the last run.

## 7. Check the pipeline without real photos

`make_smoke_dataset.py` draws cartoon leaves and pests to test the tools end to end. A model trained on it is useless on real photos.

```bash
python training/make_smoke_dataset.py --out /tmp/smoke
python training/prepare_dataset.py --raw /tmp/smoke/raw --sources /tmp/smoke/sources.yaml --out /tmp/smoke/dataset
```

Run the tests with `python -m pytest training/tests`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Class names/order ... do not match` in Colab | The zip was not built by `prepare_dataset.py`. Rebuild it. |
| `The test split is empty` | Too few plants/photos. Add photos, or check the `group` pattern isn't putting everything in one group. |
| Recall for `looper` much lower than the others | Expected (they blend into the leaf). Add more looper photos, especially close-ups on lettuce. |
| Many sprays on no-pest photos | Add more no-pest photos (holes, water drops) and raise the app's threshold. |
| `serve.py`: model classes do not match | The model was trained on a different class list. Retrain from the prepared dataset. |
| App shows an error with `DETECTOR=http` | Is `serve.py` running? Open http://localhost:8000/health. The simulator needs `--photos` with a real model. |
