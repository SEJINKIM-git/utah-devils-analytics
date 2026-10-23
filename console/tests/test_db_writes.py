"""
콘솔의 모든 저장 경로가 DB 함수(원자적 RPC)만 거치는지, 그리고 마이그레이션이 없거나 동명이인일 때
죽지 않고 안내 문구를 돌려주는지 확인한다. 운영 DB에는 붙지 않는다 (tests/fake_supabase.py).
"""
import re
from pathlib import Path

import pandas as pd
import pytest

from core.game_sheet import parse_game_workbook
from tests.fake_supabase import make_repo

DB_PY = Path(__file__).resolve().parents[1] / "core" / "db.py"
GAME_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "game-v3"


def test_db_layer_has_no_direct_table_writes():
    """db.py에 테이블 직접 insert/update/delete가 남아 있으면 안 된다 (모두 console_* RPC)."""
    src = DB_PY.read_text(encoding="utf-8")
    direct = [m.group(0) for m in re.finditer(r"\.table\([^)]*\)\s*\.(insert|update|delete)\(", src)]
    assert direct == [], direct
    chained = [m.group(0) for m in re.finditer(r"\.(insert|update|delete)\(\{", src)]
    assert chained == [], chained


def _season_frames():
    bat = pd.DataFrame([
        {"number": 7, "name": "가선수", "pa": 10, "ab": 8, "runs": 2, "hits": 3, "doubles": 1, "triples": 0, "hr": 0, "rbi": 2,
         "bb": 2, "hbp": 0, "so": 1, "sb": 1},
        {"number": 99, "name": "새선수", "pa": 4, "ab": 4, "runs": 0, "hits": 1, "doubles": 0, "triples": 0, "hr": 0, "rbi": 0,
         "bb": 0, "hbp": 0, "so": 2, "sb": 0},
    ])
    pit = pd.DataFrame([
        {"number": 7, "name": "가선수", "w": 1, "l": 0, "sv": 0, "hld": 0, "outs": 16, "ha": 3, "runs_allowed": 1, "er": 1,
         "bb": 2, "hbp": 0, "so": 5, "hr_allowed": 0},
        {"number": 99, "name": "새선수", "w": 0, "l": 0, "sv": 1, "hld": 0, "outs": 3, "ha": 0, "runs_allowed": 0, "er": 0,
         "bb": 0, "hbp": 0, "so": 2, "hr_allowed": 0},
    ])
    return bat, pit


def test_replace_season_resolves_players_and_calls_rpc_only():
    repo = make_repo()
    bat, pit = _season_frames()
    res = repo.replace_season("2024", bat, pit, "ops@test", "2024.xlsx")
    assert res.ok, res.message
    (name, params), = repo.sb.calls
    assert name == "console_replace_season"
    assert params["p_season"] == "2024" and params["p_actor"] == "ops@test"
    b0, b1 = params["p_batting"]
    assert b0 == {"player_id": 1, "pa": 10, "ab": 8, "runs": 2, "hits": 3, "doubles": 1, "triples": 0, "hr": 0, "rbi": 2,
                  "bb": 2, "hbp": 0, "so": 1, "sb": 1}
    assert {k: b1[k] for k in ("number", "name", "is_pitcher")} == {"number": 99, "name": "새선수", "is_pitcher": False}
    assert "player_id" not in b1
    p0, p1 = params["p_pitching"]
    assert p0["player_id"] == 1 and p0["set_pitcher"] is True      # 타자로만 등록된 선수가 투수 기록 → 투수 여부 보강
    assert p0["ip"] == 5.1                                          # 16아웃 → 야구식 표기 5.1
    assert p1["is_pitcher"] is True and "player_id" not in p1
    assert isinstance(p0["pa"] if "pa" in p0 else p0["so"], int)   # numpy 정수가 아닌 파이썬 정수
    assert res.counts["신규 선수"] == 1


def test_replace_season_without_migration_returns_message():
    repo = make_repo()
    del repo.sb.functions["console_replace_season"]
    bat, pit = _season_frames()
    res = repo.replace_season("2024", bat, pit, "ops", "x")
    assert not res.ok
    assert "console_replace_season" in res.message and "sql/001" in res.message


@pytest.mark.skipif(not GAME_DIR.exists(), reason="경기 기록지 fixture 없음")
class TestReplaceGame:
    def sheet(self):
        return parse_game_workbook(GAME_DIR / "reviewed.xlsx", "10_17 VS 테스트팀 경기 기록.xlsx")

    def test_new_names_go_to_rpc_without_player_id(self):
        repo = make_repo()
        res = repo.replace_game(self.sheet(), "ops@test")
        assert res.ok, res.message
        (name, params), = repo.sb.calls
        assert name == "console_replace_game"
        bat = params["p_batting"]
        known = [r for r in bat if "player_id" in r]
        fresh = [r for r in bat if "name" in r]
        assert {r["player_id"] for r in known} == {1, 2, 3}           # 가·나·다선수는 기존 선수
        assert all("number" not in r for r in fresh)                  # 배번 없는 기록지 → DB 함수가 임시 배번
        assert params["p_game"]["date"] == "2026-10-17" and params["p_game"]["result"] == "W"
        assert all(isinstance(r["sf"], int) for r in bat)
        assert all("pitches" in r for r in params["p_pitching"])
        assert "카선수" in res.counts["신규 선수"]

    def test_duplicate_name_blocks_save(self):
        repo = make_repo()
        sheet = self.sheet()
        sheet.batting.loc[0, "name"] = "홍길동"                       # 배번 72·74에 둘 다 있는 이름
        res = repo.replace_game(sheet, "ops")
        assert not res.ok
        assert "동명이인" in res.message and "#72" in res.message and "#74" in res.message
        assert repo.sb.calls == []                                    # 아무것도 저장하지 않음

    def test_without_005_returns_guidance(self):
        repo = make_repo(with_005=False)
        res = repo.replace_game(self.sheet(), "ops")
        assert not res.ok
        assert "sql/005" in res.message
        assert repo.sb.calls == []

    def test_missing_rpc_is_reported_not_raised(self):
        repo = make_repo()
        del repo.sb.functions["console_replace_game"]                 # 칸은 있는데 함수만 없는 상태
        res = repo.replace_game(self.sheet(), "ops")
        assert not res.ok and "console_replace_game" in res.message and "sql/005" in res.message


def test_update_rows_uses_rpc_with_whitelist():
    repo = make_repo()
    res = repo.update_rows("pitching_stats", [{"id": 5, "before": {"ip": 3.3, "player_id": 1}, "after": {"ip": 3.1, "player_id": 9}, "note": "표기 수정"}], "ops")
    assert res.ok and res.counts == {"rows": 1}
    (name, params), = repo.sb.calls
    assert name == "console_update_rows"
    assert params == {"p_table": "pitching_stats", "p_changes": [{"id": 5, "after": {"ip": 3.1}, "note": "표기 수정"}], "p_actor": "ops"}


def test_update_rows_nothing_allowed_is_noop():
    repo = make_repo()
    res = repo.update_rows("batting_stats", [{"id": 1, "before": {}, "after": {"player_id": 2}}], "ops")
    assert res.ok and res.counts == {"rows": 0} and repo.sb.calls == []


def test_log_situation_and_ai_report_use_rpc():
    repo = make_repo()
    sit = {"game_id": 27, "season": "2026", "inning": 6, "inning_half": "top", "base_state": 1, "out_count": 0,
           "score_us": 3, "score_them": 3, "batter_id": 1, "pitcher_id": None, "context_note": None}
    dec = {"decision_type": "bunt", "decision_summary": "번트", "rationale": None, "retrospective_eval": "pending"}
    res = repo.log_situation(sit, dec, "ops")
    assert res.ok and "LI 1.4" in res.message
    res2 = repo.save_ai_report({"report_type": "team", "season": "2026", "summary": "x"}, "ops")
    assert res2.ok
    assert [c[0] for c in repo.sb.calls] == ["console_log_situation", "console_save_ai_report"]
    assert repo.sb.calls[0][1] == {"p_situation": sit, "p_decision": dec, "p_actor": "ops"}


def test_without_006_returns_guidance():
    repo = make_repo(with_006=False)
    res = repo.update_rows("players", [{"id": 1, "before": {"name": "a"}, "after": {"name": "b"}}], "ops")
    assert not res.ok and "sql/006" in res.message
    res = repo.save_ai_report({"report_type": "team"}, "ops")
    assert not res.ok and "console_save_ai_report" in res.message


def test_ambiguous_names_only_for_different_numbers():
    repo = make_repo(players=[
        {"id": 1, "number": 7, "name": "가선수", "is_pitcher": False},
        {"id": 2, "number": 7, "name": "가 선수", "is_pitcher": False},   # 같은 배번·공백 차이 = 중복 레코드
        {"id": 3, "number": 72, "name": "홍길동", "is_pitcher": False},
        {"id": 4, "number": 74, "name": "홍길동", "is_pitcher": False},
    ])
    assert repo.ambiguous_names(["가선수", "없는선수"]) == []
    msgs = repo.ambiguous_names(["홍길동", "홍길동", "가선수"])
    assert len(msgs) == 1 and "2명" in msgs[0]
