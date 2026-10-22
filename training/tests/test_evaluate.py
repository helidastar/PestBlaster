from evaluate import Box, iou, match, score


def test_iou():
    a = Box(0, 0.0, 0.0, 0.2, 0.2)
    assert iou(a, a) == 1.0
    assert iou(a, Box(0, 0.5, 0.5, 0.1, 0.1)) == 0.0
    assert abs(iou(a, Box(0, 0.1, 0.0, 0.2, 0.2)) - 1 / 3) < 1e-9


def test_match_counts_hits_misses_and_wrong_boxes():
    truth = [Box(0, 0.1, 0.1, 0.2, 0.2), Box(2, 0.6, 0.6, 0.2, 0.2)]
    preds = [
        Box(0, 0.11, 0.1, 0.2, 0.2, conf=0.9),  # hit
        Box(1, 0.6, 0.6, 0.2, 0.2, conf=0.8),   # right place, wrong pest
        Box(0, 0.1, 0.1, 0.2, 0.2, conf=0.7),   # second box on an already-found pest
    ]
    tp, fp, fn, err = match(truth, preds, threshold=0.5, iou_min=0.5)
    assert tp == [1, 0, 0]
    assert fp == [1, 1, 0]
    assert fn == [0, 0, 1]
    assert len(err) == 1 and err[0] < 0.02


def test_threshold_drops_low_confidence_boxes():
    truth = [Box(0, 0.1, 0.1, 0.2, 0.2)]
    preds = [Box(0, 0.1, 0.1, 0.2, 0.2, conf=0.4)]
    assert match(truth, preds, 0.3, 0.5)[0] == [1, 0, 0]
    assert match(truth, preds, 0.5, 0.5)[2] == [1, 0, 0]


def test_score_picks_best_threshold_and_counts_false_sprays():
    results = [
        ([Box(0, 0.1, 0.1, 0.2, 0.2)], [Box(0, 0.1, 0.1, 0.2, 0.2, conf=0.9)]),
        ([], [Box(1, 0.5, 0.5, 0.1, 0.1, conf=0.3)]),  # no-pest photo, weak wrong box
    ]
    report = score(results)
    best = report["best_threshold"]
    assert best > 0.3
    row = report["by_threshold"][best]
    assert row["overall"]["f1"] == 1.0
    assert report["by_threshold"][0.2]["false_spray_on_no_pest_photos"] == 1
    assert row["false_spray_on_no_pest_photos"] == 0
