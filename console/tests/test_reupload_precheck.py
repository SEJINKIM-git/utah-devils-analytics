import pandas as pd

from core.reupload_precheck import analyze_reupload_impact, local_reference_counts


def test_precheck_finds_disappearing_references_and_new_player():
    players = pd.DataFrame([
        {"id": 1, "number": 38, "name": "옛선수"},
        {"id": 2, "number": 7, "name": "가선수"},
    ])
    bat_raw = pd.DataFrame([
        {"player_id": 1, "season": "2024", "game_id": None},
        {"player_id": 1, "season": "2026", "game_id": 9},
        {"player_id": 2, "season": "2024", "game_id": None},
    ])
    pit_raw = pd.DataFrame(columns=["player_id", "season", "game_id"])
    incoming_bat = pd.DataFrame([
        {"number": 38, "name": "새선수"},
        {"number": 7, "name": "가선수"},
    ])
    incoming_pit = pd.DataFrame(columns=["number", "name"])

    disappearing, new_players = analyze_reupload_impact(
        "2024", incoming_bat, incoming_pit, players, bat_raw, pit_raw
    )
    references = local_reference_counts([1], bat_raw, pit_raw)

    assert disappearing.to_dict("records") == [{"player_id": 1, "배번": 38, "이름": "옛선수"}]
    assert new_players.to_dict("records") == [{"배번": 38, "이름": "새선수"}]
    assert references.to_dict("records") == [
        {"player_id": 1, "참조 테이블": "batting_stats", "참조 열": "player_id", "참조 수": 1}
    ]


def test_player_with_other_season_summary_is_not_zero_summary():
    players = pd.DataFrame([{"id": 1, "number": 38, "name": "옛선수"}])
    bat_raw = pd.DataFrame([
        {"player_id": 1, "season": "2024", "game_id": None},
        {"player_id": 1, "season": "2025", "game_id": None},
    ])
    empty = pd.DataFrame(columns=["number", "name"])
    disappearing, _ = analyze_reupload_impact(
        "2024", empty, empty, players, bat_raw, pd.DataFrame(columns=bat_raw.columns)
    )
    assert disappearing.empty
