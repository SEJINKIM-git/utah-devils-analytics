"""
골든 테스트: 2022~2025 시즌 파일 + 통산 파일을 실제로 파싱해
  (1) 구조(시즌·학기 범위, 선수 수)가 기대대로 나오는지
  (2) 기록지 자체 수식(타율·출루율·장타율·OPS)과 콘솔 공식이 일치하는지
  (3) 통산 파일의 시즌 시트가 시즌 파일과 1:1로 같은지
  (4) 알려진 기록지 오류가 계속 '검출'되는지 (고쳐지면 이 테스트를 갱신)
를 확인한다. 파서를 고칠 때마다 `pytest`로 회귀를 막는다.

실제 기록지는 공개 저장소에 올리지 않는다. 운영진 PC에서 tests/fixtures/에 기록지를 넣으면 실행되고,
없으면 건너뛴다 (가짜 기록지 테스트는 test_parser_synthetic.py에서 항상 실행).
"""
from pathlib import Path

import pytest

from core.parser import parse_workbook
from tests.conftest import real_data
from core.validation import check_batting_rates, check_cross_files, validate

pytestmark = real_data

FIX = Path(__file__).parent / "fixtures"
SEASON_FILES = {s: FIX / f"{s}_Utah_Devils_Player_Stat.xlsx" for s in ("2022", "2023", "2024", "2025")}
CAREER_FILE = FIX / "Career_Total_Utah_Devils_Player_Stat.xlsx"


@pytest.fixture(scope="module")
def parsed():
    wbs = {s: parse_workbook(p) for s, p in SEASON_FILES.items()}
    wbs["Career"] = parse_workbook(CAREER_FILE)
    return wbs


EXPECTED_SCOPES = {
    "2022": ["2022", "2022 Fall", "2022 Spring"],
    "2023": ["2023", "2023 Fall", "2023 Spring", "2023 Summer"],
    "2024": ["2024", "2024 Fall", "2024 Spring"],
    "2025": ["2025", "2025 Fall", "2025 Spring"],
    "Career": ["2022", "2023", "2024", "2025", "Career"],
}


@pytest.mark.parametrize("key", list(EXPECTED_SCOPES))
def test_scopes(parsed, key):
    assert parsed[key].scopes == EXPECTED_SCOPES[key]


@pytest.mark.parametrize("season", list(SEASON_FILES))
def test_season_sheet_has_players(parsed, season):
    pw = parsed[season]
    bat = pw.batting[pw.batting.scope == season]
    pit = pw.pitching[pw.pitching.scope == season]
    assert len(bat) >= 10 and len(pit) >= 4
    assert bat["name"].str.len().min() >= 2
    assert not bat.duplicated(["number", "name"]).any()


def test_2023_season_totals(parsed):
    bat = parsed["2023"].batting
    s = bat[bat.scope == "2023"]
    assert (s.pa.sum(), s.ab.sum(), s.hits.sum(), s.bb.sum()) == (257, 208, 63, 43)


@pytest.mark.parametrize("key", list(EXPECTED_SCOPES))
def test_rate_formulas_match_scoresheets(parsed, key):
    """기록지 자체 수식과 콘솔 공식이 모든 선수 행에서 일치해야 한다."""
    assert check_batting_rates(parsed[key]) == []


def test_career_file_season_sheets_equal_season_files(parsed):
    issues = [i for i in check_cross_files(list(parsed.values())) if not i.sheet.startswith("Career")]
    assert issues == [], [i.message for i in issues]


def test_game_logs_parsed(parsed):
    pw = parsed["2024"]
    assert len(pw.batting_games) > 100
    assert set(pw.batting_games.term) == {"Spring", "Fall"}
    assert pw.batting_games.date.str.match(r"^2024-\d{2}-\d{2}$").all()


def test_placeholder_blocks_ignored(parsed):
    g = parsed["2025"].batting_games
    assert "선수" not in set(g["name"])


# ── 알려진 기록지 오류 (원본을 고치면 해당 줄을 지운다) ─────────────────────
def _messages(pw):
    return [f"{i.level}|{i.sheet}|{i.message}" for i in validate(pw)]


def test_known_issue_career_innings_notation(parsed):
    msgs = _messages(parsed["Career"])
    assert any(m.startswith("error|Career Totals|이닝 표기 오류: 85.4") for m in msgs)


def test_known_issue_stale_sum_range(parsed):
    msgs = _messages(parsed["2024"])
    assert any("2024 Fall" in m and "SUM 범위" in m for m in msgs)


def test_known_issue_jersey_conflict(parsed):
    msgs = _messages(parsed["2022"])
    assert any("배번이 시트마다 다름" in m for m in msgs)


def test_season_files_have_no_blocking_errors(parsed):
    for s in SEASON_FILES:
        errors = [i for i in validate(parsed[s]) if i.level == "error"]
        assert errors == [], (s, [e.message for e in errors])
