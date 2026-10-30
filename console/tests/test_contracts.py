"""
콘솔(Python)과 분석 플랫폼(TypeScript)이 같은 규칙을 쓰는지 확인한다.
한쪽만 고치면 이 테스트가 실패한다 — 두 곳의 숫자가 다시 어긋나지 않게.
"""
import ast
import json
import re
from pathlib import Path

import pandas as pd
import pytest

from core.aggregate import season_pitching
from core.stats import ERA_BASE_INNINGS, WHIP_INCLUDES_HBP, batting_rates, ip_to_outs, obp_denominator, outs_to_ip, pitching_rates

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


# ── 숫자 계약: tests/fixtures/contracts/stat-cases.json (플랫폼 tests/unit/contracts.test.ts와 같은 기대값) ──
CASES_PATH = REPO / "tests" / "fixtures" / "contracts" / "stat-cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8")) if CASES_PATH.exists() else {}
TOL = CASES.get("tolerance", 1e-6)


def approx(want):
    return None if want is None else pytest.approx(want, abs=TOL)


@pytest.mark.parametrize("case", CASES.get("innings", []), ids=lambda c: c["label"])
def test_contract_innings(case):
    strict = not case.get("lenient")
    outs = sum(ip_to_outs(v, strict=strict) for v in case["values"])
    assert outs == case["outs"]
    if case.get("notation"):
        assert outs_to_ip(outs) == case["notation"]
    if case.get("normalized"):
        assert [outs_to_ip(ip_to_outs(v, strict=False)) for v in case["values"]] == case["normalized"]


@pytest.mark.parametrize("case", CASES.get("pitching", []), ids=lambda c: c["label"])
def test_contract_pitching(case):
    r = pitching_rates(ip_to_outs(case["ip"]), case["er"], case["ha"], case["bb"], case["hbp"], case["so"])
    assert r.era == approx(case["era"])
    assert r.whip == approx(case["whip"])
    assert r.k_per_base == approx(case["k_per_base"])


def _rates(row):
    return batting_rates(row["hits"], row["ab"], row["pa"], row["bb"], row["hbp"], row["doubles"], row["triples"], row["hr"],
                         sf=row.get("sf"), obp_den=row.get("obp_den"))


@pytest.mark.parametrize("case", CASES.get("batting", []), ids=lambda c: c["label"])
def test_contract_batting(case):
    r = _rates(case["row"])
    assert (r.avg, r.obp, r.slg, r.ops) == (approx(case["avg"]), approx(case["obp"]), approx(case["slg"]), approx(case["ops"]))


@pytest.mark.skipif(not CASES, reason="계약 파일 없음")
def test_contract_batting_aggregate():
    c = CASES["batting_aggregate"]
    rows = c["rows"]
    den = sum(obp_denominator(r["ab"], r["pa"], r["bb"], r["hbp"], r.get("sf")) for r in rows)
    assert den == c["obp_den"]
    merged = {k: sum(r[k] for r in rows) for k in ("hits", "ab", "pa", "bb", "hbp", "doubles", "triples", "hr")}
    r = _rates({**merged, "obp_den": den})
    assert (r.avg, r.obp, r.slg, r.ops) == (approx(c["avg"]), approx(c["obp"]), approx(c["slg"]), approx(c["ops"]))


@pytest.mark.skipif(not CASES, reason="계약 파일 없음")
def test_contract_dedupe_and_innings_sum():
    c = CASES["dedupe"]
    players = pd.DataFrame(c["players"])
    raw = pd.DataFrame(c["rows"])
    agg, warnings = season_pitching(raw, players)
    assert warnings == []
    got = {(int(r.player_id), r.season): (int(r.outs), int(r.er), r.era) for r in agg.itertuples()}
    assert set(got) == {(t["player_id"], t["season"]) for t in c["totals"]}
    for t in c["totals"]:
        outs, er, era = got[(t["player_id"], t["season"])]
        assert (outs, er) == (t["outs"], t["er"])
        assert era == approx(t["era"])
