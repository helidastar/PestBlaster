import csv
import urllib.parse

import fetch_inaturalist as fi
from common import CLASSES


def fake_api(n_obs=5, license_code="cc-by"):
    def get_json(url):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        page = int(q["page"][0])
        if page > 1:
            return {"results": []}
        species = q["taxon_name"][0]
        base = abs(hash(species)) % 100000 * 100
        return {"results": [
            {"id": base + i, "observed_on": "2026-01-01", "place_guess": "Somewhere",
             "photos": [
                 {"id": 10 * (base + i) + 1, "license_code": license_code,
                  "url": "https://x/photos/1/square.jpg", "attribution": "(c) someone, CC BY"},
                 {"id": 10 * (base + i) + 2, "license_code": "cc-by-nc",
                  "url": "https://x/photos/2/square.jpg", "attribution": "(c) other"},
             ]} for i in range(n_obs)]}
    return get_json


def test_taxa_use_our_classes():
    assert list(fi.TAXA) == CLASSES


def test_query_url_filters_larvae_and_licence():
    url = fi.query_url("Spodoptera litura", 1, True, 6774)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert q["quality_grade"] == ["research"]
    assert q["photo_license"] == ["cc0,cc-by"]
    assert q["term_id"] == ["1"] and q["term_value_id"] == ["6"]
    assert q["place_id"] == ["6774"]
    assert "term_id" not in urllib.parse.parse_qs(
        urllib.parse.urlparse(fi.query_url("Myzus persicae", 1, False, None)).query)


def test_fetch_keeps_only_free_licences_and_stops_at_quota(tmp_path):
    rows = fi.fetch_class("looper", tmp_path, 6, None, get_json=fake_api(),
                          get_bytes=lambda u: b"jpg", pause=0)
    files = list((tmp_path / "looper").glob("inat_*.jpg"))
    assert len(rows) == len(files) == 6
    assert all(r["license"] == "cc-by" for r in rows)
    assert all("/large." in r["photo_url"] for r in rows)


def test_rerun_skips_existing_and_writes_credits(tmp_path):
    kw = dict(get_json=fake_api(), get_bytes=lambda u: b"jpg", pause=0)
    first = fi.fetch_class("aphid_colony", tmp_path, 4, None, **kw)
    again = fi.fetch_class("aphid_colony", tmp_path, 4, None, **kw)
    assert len(first) == 4 and again == []
    fi.append_credits(tmp_path / "credits.csv", first)
    with (tmp_path / "credits.csv").open() as fh:
        assert len(list(csv.DictReader(fh))) == 4


def test_no_photos_when_licence_not_free(tmp_path):
    rows = fi.fetch_class("looper", tmp_path, 5, None, get_json=fake_api(license_code="cc-by-nc"),
                          get_bytes=lambda u: b"jpg", pause=0)
    assert rows == []
