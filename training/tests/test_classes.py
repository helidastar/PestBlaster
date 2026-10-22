import re
from pathlib import Path

from common import CLASSES


def test_classes_match_the_app():
    """The model's class ids must line up with PEST_TYPES in the app."""
    ts = (Path(__file__).resolve().parents[2] / "src" / "lib" / "pests.ts").read_text()
    m = re.search(r"PEST_TYPES\s*=\s*\[([^\]]*)\]", ts)
    assert m, "PEST_TYPES not found in src/lib/pests.ts"
    assert re.findall(r'"([^"]+)"', m.group(1)) == CLASSES
