"""
경기 기록지 v3.0 파서. 기대값은 저장소 tests/fixtures/game-v3/expected.json —
공식 템플릿 수식이 계산한 값이며, 분석 플랫폼 파서(tests/unit/gameSheet.test.ts)도 같은 기대값으로 검사한다.
"""
import json
import shutil
from pathlib import Path

import openpyxl
import pytest

from core.aggregate import season_batting
from core.game_sheet import parse_game_workbook
from core.stats import batting_rates, obp_denominator, pitching_rates

DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "game-v3"
pytestmark = pytest.mark.skipif(not DIR.exists(), reason="분석 플랫폼 저장소 밖에서 실행됨")
EXPECTED = json.loads((DIR / "expected.json").read_text(encoding="utf-8")) if DIR.exists() else {}
NAME = "10_17 VS 테스트팀 경기 기록.xlsx"
BAT_KEYS = ["pa", "ab", "hits", "doubles", "triples", "hr", "bb", "hbp", "so", "sf", "sh", "ci", "runs", "rbi", "sb"]
PIT_KEYS = ["outs", "pitches", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed", "w", "l", "sv", "hld"]


def parse(file, name=NAME):
    return parse_game_workbook(DIR / file, name)


@pytest.mark.parametrize("file", ["recalculated.xlsx", "uncached.xlsx", "reviewed.xlsx"])
def test_matches_template_formulas(file):
    g = parse(file)
    exp = EXPECTED["info"]
    assert {k: g.info[k] for k in ("date", "opponent", "season", "is_home", "location", "score_us", "score_them",
                                   "defense_outs")} == {k: exp[k] for k in ("date", "opponent", "season", "is_home",
                                                                              "location", "score_us", "score_them",
                                                                              "defense_outs")}
    assert g.batting["name"].tolist() == [b["name"] for b in EXPECTED["batting"]]
    for exp_b in EXPECTED["batting"]:
        row = g.batting[g.batting.name == exp_b["name"]].iloc[0]
        assert {k: int(row[k]) for k in BAT_KEYS} == {k: exp_b[k] for k in BAT_KEYS}, exp_b["name"]
        r = batting_rates(row.hits, row.ab, row.pa, row.bb, row.hbp, row.doubles, row.triples, row.hr, sf=row.sf)
        assert r.obp == pytest.approx(exp_b["obp"] or 0, abs=1e-5)
    for exp_p in EXPECTED["pitching"]:
        row = g.pitching[g.pitching.name == exp_p["name"]].iloc[0]
        assert {k: int(row[k]) for k in PIT_KEYS} == {k: exp_p[k] for k in PIT_KEYS}, exp_p["name"]
        assert float(row.ip) == pytest.approx(float(exp_p["ip_notation"]))
        assert (pitching_rates(row.outs, row.er, row.ha, row.bb, row.hbp, row.so).era or 0) == pytest.approx(exp_p["era"])


def test_team_obp_uses_v3_denominator():
    b = parse("reviewed.xlsx").batting
    den = sum(obp_denominator(r.ab, r.pa, r.bb, r.hbp, r.sf) for r in b.itertuples())
    assert (b.hits.sum() + b.bb.sum() + b.hbp.sum()) / den == pytest.approx(EXPECTED["team"]["obp"], abs=1e-5)


def test_aggregate_mixes_legacy_and_v3_rows():
    """과거 시즌 행(sf 없음)은 ÷ 타석, v3.0 행은 ÷ (AB+BB+HBP+SF)로 각각 분모를 정해 합산한다."""
    import pandas as pd

    players = pd.DataFrame([{"id": 1, "number": 7, "name": "가선수", "is_pitcher": False}])
    raw = pd.DataFrame([
        {"player_id": 1, "season": "2025", "game_id": None, "pa": 5, "ab": 3, "runs": 0, "hits": 1, "doubles": 0,
         "triples": 0, "hr": 0, "rbi": 0, "bb": 1, "hbp": 0, "so": 0, "sb": 0, "sf": None},
        {"player_id": 1, "season": "2026", "game_id": 27, "pa": 4, "ab": 2, "runs": 0, "hits": 1, "doubles": 0,
         "triples": 0, "hr": 0, "rbi": 0, "bb": 0, "hbp": 0, "so": 0, "sb": 0, "sf": 1},
    ])
    agg = season_batting(raw, players).set_index("season")
    assert agg.loc["2025", "obp"] == pytest.approx(2 / 5)   # 과거: ÷ 타석
    assert agg.loc["2026", "obp"] == pytest.approx(1 / 3)   # v3.0: ÷ (2+0+0+1), 희생번트 1 제외
    from core.aggregate import career
    assert career(season_batting(raw, players), "batting").iloc[0]["obp"] == pytest.approx(3 / 8)


def test_review_warnings():
    assert any("검수 시트 상태: 확인 필요" in w for w in parse("recalculated.xlsx").warnings)
    reviewed = parse("reviewed.xlsx")
    assert reviewed.is_reviewed and reviewed.warnings == []
    assert "검수 시트를 찾지 못했거나 검수 요약이 비어 있습니다." in parse("uncached.xlsx").warnings


def test_today_formula_and_filename_mismatch():
    assert any("=TODAY()" in w for w in parse("today-formula.xlsx").warnings)
    g = parse("reviewed.xlsx", "9_17 VS 테스트팀 경기 기록.xlsx")
    assert g.info["date"] == "2026-10-17"
    assert any("파일명 날짜(2026-09-17)" in w for w in g.warnings)


def test_cached_mismatch_and_unknown_code(tmp_path):
    src = tmp_path / "edited.xlsx"
    shutil.copy(DIR / "reviewed.xlsx", src)
    wb = openpyxl.load_workbook(src)
    wb["타자 기록"]["H2"] = "중전안타"
    wb.save(src)  # 수식 결과가 사라짐 → 타석 결과로 계산
    g = parse_game_workbook(src, NAME)
    first = g.batting.iloc[0]
    assert (first.pa, first.hits) == (6, 3)
    assert any("목록에 없는 타석 결과 '중전안타'" in w for w in g.warnings)
