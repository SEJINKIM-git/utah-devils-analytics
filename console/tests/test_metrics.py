"""
지표 사전(lib/metrics/registry.json)이 콘솔 쪽 계산 함수에 빠짐없이 연결돼 있는지,
사전을 거친 계산이 숫자 계약(tests/fixtures/contracts/stat-cases.json)과 맞는지 확인한다.
분석 플랫폼 쪽 짝은 tests/unit/metricsRegistry.test.ts.
"""
import json
from pathlib import Path

import pytest

from core import metrics
from core.stats import ERA_BASE_INNINGS, fmt_rate, ip_to_outs, obp_denominator

REPO = Path(__file__).resolve().parents[2]
CASES_PATH = REPO / "tests" / "fixtures" / "contracts" / "stat-cases.json"

pytestmark = pytest.mark.skipif(not metrics.REGISTRY_PATH.exists(), reason="분석 플랫폼 저장소 밖에서 실행됨")

CASES = json.loads(CASES_PATH.read_text(encoding="utf-8")) if CASES_PATH.exists() else {}
TOL = CASES.get("tolerance", 1e-6)
CODES = [m["code"] for m in metrics.metrics()] if metrics.REGISTRY_PATH.exists() else []


def approx(want):
    return None if want is None else pytest.approx(want, abs=TOL)


@pytest.mark.parametrize("code", CODES)
def test_every_code_is_wired_to_a_function(code):
    assert metrics.is_computable(code), f"{code}: stats.py 함수(또는 합계 칸)에 연결되지 않음"


def test_codes_and_aliases_are_unique():
    codes = [m["code"].upper() for m in metrics.metrics()]
    assert len(codes) == len(set(codes))
    owner = {}
    for m in metrics.metrics():
        for term in {m["code"].lower(), *(a.lower() for a in m["aliases"])}:
            assert term not in owner, f"'{term}'이 {owner.get(term)}와 {m['code']}에 겹침"
            owner[term] = m["code"]


def test_base_innings_matches_stats_module():
    assert metrics.load_registry()["baseInnings"] == ERA_BASE_INNINGS
    assert metrics.get_metric(f"K{ERA_BASE_INNINGS}") and metrics.get_metric(f"BB{ERA_BASE_INNINGS}")


def test_required_fields_present():
    for m in metrics.metrics():
        for key in ("code", "nameKo", "nameEn", "kind", "type", "summaryKo", "formulaKo", "digits", "leadingZero", "higherIsBetter", "aliases"):
            assert key in m, f"{m.get('code')}: {key} 없음"
        assert m["kind"] in ("batting", "pitching") and m["type"] in ("rate", "count", "innings")


@pytest.mark.parametrize("case", CASES.get("pitching", []), ids=lambda c: c["label"])
def test_contract_pitching_through_registry(case):
    totals = {"outs": ip_to_outs(case["ip"]), "er": case["er"], "ha": case["ha"], "bb": case["bb"], "hbp": case["hbp"], "so": case["so"]}
    assert metrics.compute("ERA", totals) == approx(case["era"])
    assert metrics.compute("WHIP", totals) == approx(case["whip"])
    assert metrics.compute(f"K{ERA_BASE_INNINGS}", totals) == approx(case["k_per_base"])
    assert metrics.compute("K", totals) == case["so"]
    assert metrics.compute("IP", totals) == pytest.approx(ip_to_outs(case["ip"]) / 3)


@pytest.mark.parametrize("case", CASES.get("batting", []), ids=lambda c: c["label"])
def test_contract_batting_through_registry(case):
    row = case["row"]
    totals = {**row, "obp_den": obp_denominator(row["ab"], row["pa"], row["bb"], row["hbp"], row.get("sf"))}
    got = tuple(metrics.compute(code, totals) for code in ("AVG", "OBP", "SLG", "OPS"))
    assert got == (approx(case["avg"]), approx(case["obp"]), approx(case["slg"]), approx(case["ops"]))
    assert metrics.compute("H", totals) == row["hits"]
    assert metrics.compute("BBHBP", totals) == row["bb"] + row["hbp"]


@pytest.mark.skipif(not CASES, reason="계약 파일 없음")
def test_contract_batting_aggregate_through_registry():
    c = CASES["batting_aggregate"]
    rows = c["rows"]
    totals = {k: sum(r[k] for r in rows) for k in ("hits", "ab", "pa", "bb", "hbp", "doubles", "triples", "hr")}
    totals["obp_den"] = sum(obp_denominator(r["ab"], r["pa"], r["bb"], r["hbp"], r.get("sf")) for r in rows)
    assert totals["obp_den"] == c["obp_den"]
    got = tuple(metrics.compute(code, totals) for code in ("AVG", "OBP", "SLG", "OPS"))
    assert got == (approx(c["avg"]), approx(c["obp"]), approx(c["slg"]), approx(c["ops"]))


@pytest.mark.skipif(not CASES, reason="계약 파일 없음")
def test_contract_innings_through_registry():
    for case in CASES["innings"]:
        outs = sum(ip_to_outs(v, strict=not case.get("lenient")) for v in case["values"])
        assert outs == case["outs"]
        if case.get("notation"):
            assert metrics.fmt("IP", metrics.compute("IP", {"outs": outs})) == case["notation"]


def test_format_follows_registry_and_matches_existing_console_format():
    assert metrics.fmt("OBP", 0.4280155) == ".428" == fmt_rate(0.4280155, 3)
    assert metrics.fmt("OPS", 1.0126) == "1.013" == fmt_rate(1.0126, 3)
    assert metrics.fmt("ERA", 3.9642857) == "3.96" == fmt_rate(3.9642857, 2)
    assert metrics.fmt("ERA", 0.5) == "0.50"
    assert metrics.fmt("HR", 3.0) == "3"
    assert metrics.fmt("AVG", None) == "---"
    assert metrics.fmt("OBP", 0.4280155, leading_zero=True) == "0.428"


def test_labels_used_by_console_tables_come_from_registry():
    from core.ui import BAT_LABELS, PIT_LABELS

    assert BAT_LABELS["obp"] == metrics.metric_short_name("OBP") == "출루율"
    assert PIT_LABELS["era"] == metrics.metric_short_name("ERA") == "ERA"
    assert PIT_LABELS[f"k_{ERA_BASE_INNINGS}"] == f"K/{ERA_BASE_INNINGS}"
