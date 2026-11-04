"""
콘솔(Python)과 분석 플랫폼(TypeScript)이 같은 규칙을 쓰는지 확인한다.
한쪽만 고치면 이 테스트가 실패한다 — 두 곳의 숫자가 다시 어긋나지 않게.
"""
import ast
import re
from pathlib import Path

import pytest

from core.stats import ERA_BASE_INNINGS, WHIP_INCLUDES_HBP

REPO = Path(__file__).resolve().parents[2]
LIB = REPO / "lib"

pytestmark = pytest.mark.skipif(not LIB.exists(), reason="분석 플랫폼 저장소 밖에서 실행됨")


def test_era_base_innings_matches_platform():
    ts = (LIB / "statFormulas.ts").read_text(encoding="utf-8")
    assert int(re.search(r"ERA_BASE_INNINGS\s*=\s*(\d+)", ts).group(1)) == ERA_BASE_INNINGS


def test_whip_definition_matches_platform():
    ts = (LIB / "statFormulas.ts").read_text(encoding="utf-8")
    body = re.search(r"function computeWhip\([^)]*\)[^{]*\{([^}]*)\}", ts).group(1)
    assert ("hbp" in body.lower()) == WHIP_INCLUDES_HBP


def test_decision_types_match_platform():
    ts = (LIB / "decisionTypes.ts").read_text(encoding="utf-8")
    platform = re.findall(r'\{\s*value:\s*"([a-z_]+)"', ts)
    src = (Path(__file__).resolve().parents[1] / "views" / "situations.py").read_text(encoding="utf-8")
    console = ast.literal_eval(re.search(r"^DECISION = (\{.*?\})$", src, re.S | re.M).group(1))
    assert sorted(console) == sorted(platform)
