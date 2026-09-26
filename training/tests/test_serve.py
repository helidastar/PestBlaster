import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from serve import check_names, create_app, to_detections


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (90, 160, 70)).save(buf, "JPEG")
    return buf.getvalue()


def test_to_detections_matches_the_app_contract():
    out = to_detections([(0.1, 0.2, 0.3, 0.5, 2, 0.8), (0.5, 0.5, 0.6, 0.6, 0, 0.95)])
    assert out[0] == {"pest": "diamondback_larva", "confidence": 0.95, "bbox": {"x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1}}
    assert out[1]["pest"] == "aphid_cluster"
    assert out[1]["bbox"] == {"x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3}


def test_to_detections_clips_and_drops_bad_boxes():
    out = to_detections([(-0.1, 0.0, 0.2, 1.2, 1, 0.5), (0.4, 0.4, 0.4, 0.5, 1, 0.9), (0.1, 0.1, 0.2, 0.2, 7, 0.9)])
    assert len(out) == 1
    assert out[0]["bbox"]["x"] == 0.0 and out[0]["bbox"]["h"] == 1.0


def test_check_names():
    check_names({0: "diamondback_larva", 1: "looper", 2: "aphid_cluster"})
    with pytest.raises(SystemExit):
        check_names({0: "looper", 1: "diamondback_larva", 2: "aphid_cluster"})


def test_detect_endpoint():
    app = create_app(lambda img: [(0.1, 0.1, 0.2, 0.2, 1, 0.7)], {"model": "fake"})
    client = TestClient(app)
    res = client.post("/detect", content=jpeg(), headers={"content-type": "image/jpeg"})
    assert res.status_code == 200
    assert res.json()["detections"][0]["pest"] == "looper"
    assert client.get("/health").json()["model"] == "fake"
    assert client.post("/detect", content=b"").status_code == 400
    assert client.post("/detect", content=b"not a photo").status_code == 400
