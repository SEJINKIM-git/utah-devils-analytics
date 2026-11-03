"""시즌 재업로드 영향 미리보기. 계산과 DB 조회만 하며 쓰기는 하지 않는다."""
from __future__ import annotations

import pandas as pd

from .aggregate import identity_key


def analyze_reupload_impact(season: str, batting: pd.DataFrame, pitching: pd.DataFrame,
                            players: pd.DataFrame, bat_raw: pd.DataFrame, pit_raw: pd.DataFrame):
    incoming = pd.concat([
        batting[["number", "name"]] if not batting.empty else pd.DataFrame(columns=["number", "name"]),
        pitching[["number", "name"]] if not pitching.empty else pd.DataFrame(columns=["number", "name"]),
    ]).drop_duplicates()
    incoming_keys = {identity_key(r.number, r.name) for r in incoming.itertuples()}
    player_keys = {int(r.id): identity_key(r.number, r.name) for r in players.itertuples()}

    def summary_ids(frame: pd.DataFrame, target_season: str | None = None) -> set[int]:
        if frame is None or frame.empty or "player_id" not in frame:
            return set()
        rows = frame[frame["game_id"].isna()] if "game_id" in frame else frame
        if target_season is not None and "season" in rows:
            rows = rows[rows["season"].astype(str) == str(target_season)]
        return {int(v) for v in rows["player_id"].dropna()}

    replacing = summary_ids(bat_raw, season) | summary_ids(pit_raw, season)
    def other_summary_ids(frame: pd.DataFrame) -> set[int]:
        if frame is None or frame.empty or "player_id" not in frame:
            return set()
        rows = frame[frame["game_id"].isna()] if "game_id" in frame else frame
        if "season" in rows:
            rows = rows[rows["season"].astype(str) != str(season)]
        return {int(v) for v in rows["player_id"].dropna()}

    summaries_other = other_summary_ids(bat_raw) | other_summary_ids(pit_raw)
    disappearing_ids = {
        pid for pid in replacing
        if player_keys.get(pid) not in incoming_keys and pid not in summaries_other
    }
    disappearing = players[players["id"].isin(disappearing_ids)][["id", "number", "name"]].copy()
    disappearing.columns = ["player_id", "배번", "이름"]

    known_keys = set(player_keys.values())
    mask = pd.Series([identity_key(r.number, r.name) not in known_keys for r in incoming.itertuples()], index=incoming.index, dtype=bool)
    new_players = incoming.loc[mask].copy()
    new_players.columns = ["배번", "이름"]
    return disappearing.reset_index(drop=True), new_players.reset_index(drop=True)


def local_reference_counts(player_ids: list[int], bat_raw: pd.DataFrame, pit_raw: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for table, frame in (("batting_stats", bat_raw), ("pitching_stats", pit_raw)):
        if frame is None or frame.empty or "player_id" not in frame:
            continue
        game_rows = frame[frame["game_id"].notna()] if "game_id" in frame else frame.iloc[0:0]
        counts = game_rows[game_rows["player_id"].isin(player_ids)].groupby("player_id").size()
        rows.extend({"player_id": int(pid), "참조 테이블": table, "참조 열": "player_id", "참조 수": int(n)}
                    for pid, n in counts.items() if n)
    return pd.DataFrame(rows, columns=["player_id", "참조 테이블", "참조 열", "참조 수"])
