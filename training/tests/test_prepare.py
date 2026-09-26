import json
import shutil

import pytest
import yaml
from PIL import Image, ImageDraw

import prepare_dataset as prep
from common import CLASSES


def photo(path, seed, size=(320, 240)):
    """A distinct photo per seed (different shapes, so the duplicate check tells them apart)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", size, (90, 160, 70))
    d = ImageDraw.Draw(img)
    for i in range(6):
        x = (seed * 37 + i * 53) % size[0]
        y = (seed * 91 + i * 29) % size[1]
        d.rectangle([x, y, x + 40, y + 30], fill=((seed * 50 + i * 40) % 255, (i * 70) % 255, (seed * 13) % 255))
    img.save(path)


@pytest.fixture
def raw(tmp_path):
    src = tmp_path / "raw" / "rf"
    (src / "data.yaml").parent.mkdir(parents=True)
    (src / "data.yaml").write_text(yaml.safe_dump({"names": ["Aphid", "Cabbage Looper", "Beetle"]}))
    for i in range(20):
        photo(src / "images" / f"plant{i // 2:02d}_{i}.jpg", i)
        (src / "labels").mkdir(exist_ok=True)
        cls = i % 3
        (src / "labels" / f"plant{i // 2:02d}_{i}.txt").write_text(f"{cls} 0.5 0.5 0.2 0.2\n1 0.3 0.3 0.1 0.1\n")
    neg = tmp_path / "raw" / "healthy"
    for i in range(4):
        photo(neg / f"h{i}.jpg", 100 + i)
    sources = tmp_path / "sources.yaml"
    sources.write_text(yaml.safe_dump({"sources": {
        "rf": {"map": {"aphid": "aphid_cluster", "cabbage looper": "looper", "beetle": None}, "group": r"^(plant\d+)_"},
        "healthy": {"negatives": True},
    }}))
    return tmp_path


def run(raw, *extra):
    return prep.main(["--raw", str(raw / "raw"), "--sources", str(raw / "sources.yaml"), "--out", str(raw / "dataset"), *extra])


def labels(raw):
    out = {}
    for split in ("train", "val", "test"):
        for f in (raw / "dataset" / "labels" / split).glob("*.txt"):
            out[f.stem] = (split, f.read_text())
    return out


def test_builds_yolo_dataset_with_our_class_ids(raw):
    assert run(raw) == 0
    spec = yaml.safe_load((raw / "dataset" / "data.yaml").read_text())
    assert spec["names"] == {i: c for i, c in enumerate(CLASSES)}
    got = labels(raw)
    assert len(got) == 24
    ids = {int(line.split()[0]) for _, text in got.values() for line in text.splitlines()}
    assert ids <= {CLASSES.index("aphid_cluster"), CLASSES.index("looper")}
    assert sum(1 for _, text in got.values() if text == "") == 4  # the healthy photos


def test_photos_of_one_plant_stay_in_one_split(raw):
    run(raw)
    manifest = json.loads((raw / "dataset" / "manifest.json").read_text())
    assert set(manifest.values()) <= {"train", "val", "test"}
    report = json.loads((raw / "dataset" / "report.json").read_text())
    assert report["splits"]["test"]["photos"] > 0
    # Rebuild the items to map keys back to plants.
    r = prep.Report()
    items = prep.dedupe(prep.inspect(prep.load_sources(yaml.safe_load((raw / "sources.yaml").read_text()), raw / "raw", r), r), r)
    by_group = {}
    for it in items:
        by_group.setdefault(it.group, set()).add(manifest[it.key])
    assert all(len(s) == 1 for s in by_group.values())


def test_test_photos_stay_in_test_when_more_photos_are_added(raw):
    run(raw)
    before = {k: v for k, v in json.loads((raw / "dataset" / "manifest.json").read_text()).items() if v == "test"}
    src = raw / "raw" / "rf"
    for i in range(20, 40):
        photo(src / "images" / f"plant{i // 2:02d}_{i}.jpg", i)
        (src / "labels" / f"plant{i // 2:02d}_{i}.txt").write_text("0 0.5 0.5 0.2 0.2\n")
    run(raw)
    after = json.loads((raw / "dataset" / "manifest.json").read_text())
    assert all(after[k] == "test" for k in before)


def test_resized_copy_with_same_labels_is_removed(raw):
    src = raw / "raw" / "rf"
    Image.open(src / "images" / "plant00_0.jpg").resize((160, 120)).save(src / "images" / "copy_0.jpg")
    shutil.copy(src / "labels" / "plant00_0.txt", src / "labels" / "copy_0.txt")
    run(raw)
    report = json.loads((raw / "dataset" / "report.json").read_text())
    assert report["dropped"]["duplicate photo"] == 1
    assert len(labels(raw)) == 24


def test_same_photo_with_different_labels_is_kept_and_reported(raw):
    src = raw / "raw" / "rf"
    shutil.copy(src / "images" / "plant00_0.jpg", src / "images" / "other_0.jpg")
    (src / "labels" / "other_0.txt").write_text("1 0.8 0.8 0.1 0.1\n")
    run(raw)
    report = json.loads((raw / "dataset" / "report.json").read_text())
    assert "duplicate photo" not in report["dropped"]
    assert any("different labels" in w for w in report["warnings"])
    assert len(labels(raw)) == 25


def test_broken_labels_and_unmapped_only_photos_are_left_out(raw):
    src = raw / "raw" / "rf"
    photo(src / "images" / "bad.jpg", 200)
    (src / "labels" / "bad.txt").write_text("0 0.5 0.5 1.5 0.2\n")
    photo(src / "images" / "beetles.jpg", 201)
    (src / "labels" / "beetles.txt").write_text("2 0.5 0.5 0.2 0.2\n")
    run(raw)
    report = json.loads((raw / "dataset" / "report.json").read_text())
    assert report["dropped"]["photo with a broken label"] == 1
    assert report["dropped"]["photo with only unmapped pests"] == 1


def test_dry_run_writes_nothing(raw):
    assert run(raw, "--dry-run") == 0
    assert not (raw / "dataset").exists()


def test_unknown_target_class_is_an_error(raw):
    (raw / "sources.yaml").write_text(yaml.safe_dump({"sources": {"rf": {"map": {"aphid": "grasshopper"}}}}))
    with pytest.raises(SystemExit):
        run(raw)
