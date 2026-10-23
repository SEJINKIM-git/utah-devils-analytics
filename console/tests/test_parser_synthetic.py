"""가짜 기록지로 파서·검증기의 동작을 고정한다 (항상 실행)."""
import pytest

from core.parser import parse_workbook
from core.validation import check_batting_rates, check_cross_files, validate
from tests.synthetic import BATTING, SEASON


@pytest.fixture(scope="module")
def parsed(tmp_path_factory):
    from tests.synthetic import build_all

    files = build_all(tmp_path_factory.mktemp("parse"))
    return {p.name.split("_")[0]: parse_workbook(p) for p in files}


def messages(pw):
    return [f"{i.level}|{i.sheet}|{i.message}" for i in validate(pw)]


def test_scopes_and_counts(parsed):
    pw = parsed[SEASON]
    assert pw.scopes == ["2099", "2099 Fall", "2099 Spring"]
    season = pw.batting[pw.batting.scope == SEASON]
    assert len(season) == len(BATTING)
    assert season.name.tolist() == ["가선수", "나선수", "다선수", "라선수"]


def test_season_totals_match_game_logs(parsed):
    pw = parsed[SEASON]
    season = pw.batting[pw.batting.scope == SEASON]
    expected_hits = sum(g[4] for games in BATTING.values() for g in games)
    assert int(season.hits.sum()) == expected_hits


def test_innings_converted_to_outs(parsed):
    pit = parsed[SEASON].pitching
    na = pit[(pit.scope == SEASON) & (pit.name == "나선수")].iloc[0]
    assert na.outs == 32  # 5.1 + 5.1 = 10⅔이닝 = 32아웃


def test_game_logs_skip_dnp_and_placeholders(parsed):
    games = parsed[SEASON].batting_games
    assert "선수" not in set(games.name)
    assert len(games) == 10  # 12경기 중 출전 안 한 2경기 제외
    assert set(games.term) == {"Spring", "Fall"}


def test_rates_formula_matches_sheet(parsed):
    assert check_batting_rates(parsed[SEASON]) == []


@pytest.mark.parametrize("needle", [
    "SUM 범위가 위쪽 3명만 포함하는 것으로 보임(누락: 라선수)",   # 합계 행 범위 누락
    "'라선수' 배번이 시트마다 다름",                               # 배번 충돌
    "23. 다선수: 학기 합 vs 시즌 시트 불일치",                      # 학기 ≠ 시즌
    "이름 미입력 템플릿 블록",                                      # 빈 템플릿
    "합계 행 이닝 표기 오류: 15.4",                                 # 합계 행이 표기를 소수로 더함
])
def test_detects_known_defects(parsed, needle):
    assert any(needle in m for m in messages(parsed[SEASON])), needle


def test_footer_innings_is_not_blocking_but_player_row_is(parsed):
    season_levels = {m.split("|")[0] for m in messages(parsed[SEASON]) if "이닝 표기 오류" in m}
    assert season_levels == {"info"}
    career = messages(parsed["Career"])
    assert any(m.startswith("error|Career Totals|이닝 표기 오류: 10.4") for m in career)


def test_cross_file_check(parsed):
    msgs = [i.message for i in check_cross_files(list(parsed.values()))]
    assert any("다선수: 통산파일 vs 시즌파일 불일치" in m for m in msgs)
    assert any("나선수: Career Totals vs 시즌 시트 합 불일치" in m for m in msgs)


def test_hall_of_fame_ignored(parsed):
    assert any("명예의 전당" in m for m in messages(parsed["Career"]))
