from fastapi.testclient import TestClient
from PIL import Image

from roboflow_detector import map_class, roboflow_predictor, to_rows
from serve import create_app, to_detections

REPLY = {
    "image": {"width": 640, "height": 480},
    "predictions": [
        {"x": 320, "y": 240, "width": 64, "height": 48, "confidence": 0.91, "class": "Cabbage Looper"},
        {"x": 100, "y": 100, "width": 40, "height": 40, "confidence": 0.8, "class": "aphids"},
        {"x": 500, "y": 300, "width": 80, "height": 40, "confidence": 0.7, "class": "fall-armyworm"},
        {"x": 50, "y": 50, "width": 10, "height": 10, "confidence": 0.9, "class": "ladybug"},
        {"x": 60, "y": 60, "width": 10, "height": 10, "confidence": 0.1, "class": "aphid"},
    ],
}


class FakeClient:
    def __init__(self):
        self.calls = []

    def infer(self, image, model_id):
        self.calls.append(model_id)
        return REPLY


def test_maps_roboflow_names_to_our_classes():
    assert map_class("Cabbage Looper") == "looper"
    assert map_class("fall_armyworm") == "armyworm_cutworm"
    assert map_class("Black Cutworm") == "armyworm_cutworm"
    assert map_class("Aphids") == "aphid_colony"
    assert map_class("ladybug") is None


def test_converts_pixel_centres_to_the_app_contract():
    out = to_detections(to_rows(REPLY, min_conf=0.2))
    assert [d["pest"] for d in out] == ["looper", "aphid_colony", "armyworm_cutworm"]
    assert out[0]["bbox"] == {"x": 0.45, "y": 0.45, "w": 0.1, "h": 0.1}


def test_serves_a_roboflow_model_on_detect():
    client = FakeClient()
    predict, info = roboflow_predictor("pest-detection-qbalv/3", 0.2, client=client)
    app = TestClient(create_app(predict, info))
    import io

    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, "JPEG")
    res = app.post("/detect", content=buf.getvalue(), headers={"content-type": "image/jpeg"})
    assert res.status_code == 200
    assert len(res.json()["detections"]) == 3
    assert client.calls == ["pest-detection-qbalv/3"]
    assert app.get("/health").json()["model"] == "roboflow:pest-detection-qbalv/3"
