"""
DB 원본 행 → 선수·시즌 단위 집계.

집계 규칙 (기존 플랫폼에서 숫자가 어긋나던 원인을 한 곳에서 정리)
  1. 시즌 값은 '20XX'만 인정. 'Spring'/'Fall'처럼 학기가 시즌 칸에 들어간 행은 제외하고 점검 탭에 노출.
  2. 'Career' 행은 저장된 통산 시트 값이라 집계에 쓰지 않는다. 통산 = 시즌 합.
     (통산 시트는 이닝 표기를 소수로 더해 85.4 같은 불가능한 값이 들어 있음)
  3. 같은 선수·시즌에 경기별 행(game_id 있음)이 있으면 그것만 합산, 없으면 시즌 요약 행을 쓴다.
     2026 시즌처럼 요약 행과 경기별 행이 섞이면 이중 합산되는 문제를 막는다.
  4. 이닝은 아웃카운트로 바꿔서 더한다.
"""
from __future__ import annotations

import re

import pandas as pd

from .stats import BATTING_COUNTS, add_batting_rates, add_pitching_rates, ip_to_outs

SEASON_RE = re.compile(r"^20\d{2}$")
BAT_DB = ["pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"]
PIT_DB = ["w", "l", "sv", "hld", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed"]


def identity_key(number, name) -> str:
    return f"{int(number or 0)}:{re.sub(r'\s+', '', str(name or '')).lower()}"


def canonical_players(players: pd.DataFrame) -> pd.DataFrame:
    """같은 (배번, 이름) 중복 레코드를 최신 id 하나로 합친다 (기존 dedupePlayersByIdentity와 동일)."""
    p = players.copy()
    p["identity"] = [identity_key(n, m) for n, m in zip(p["number"], p["name"])]
    canon = p.sort_values("id", ascending=False).drop_duplicates("identity")[["identity", "id"]]
    p = p.merge(canon.rename(columns={"id": "canonical_id"}), on="identity")
    return p


def _prepare(raw: pd.DataFrame, players: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    if raw.empty:
        return pd.DataFrame(columns=["player_id", "season", *cols])
    df = raw.copy()
    df["season"] = df["season"].astype(str).str.strip()
    df = df[df["season"].str.match(SEASON_RE)]
    for c in cols:
        # 없는 칸(예: 마이그레이션 전 DB의 sf)은 0으로 — df.get(c, 0)은 스칼라를 돌려줘 .fillna에서 죽는다
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0) if c in df.columns else 0
    if "game_id" not in df.columns:
        df["game_id"] = None
    cp = canonical_players(players)[["id", "canonical_id"]]
    df = df.merge(cp, left_on="player_id", right_on="id", how="inner", suffixes=("", "_p"))
    df["player_id"] = df["canonical_id"]
    has_game = df.groupby(["player_id", "season"])["game_id"].transform(lambda s: s.notna().any())
    # 규칙 3: 경기별 행이 있으면 요약 행은 버린다
    df = df[~has_game | df["game_id"].notna()]
    return df


def season_batting(raw: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    df = _prepare(raw, players, BAT_DB)
    if df.empty:
        return pd.DataFrame()
    df["g"] = df["game_id"].notna().astype(int)  # 경기별 행만 경기 수로 센다
    # 출루율 분모: 희생플라이 구분이 있는 행(v3.0 경기 기록지)은 AB+BB+HBP+SF, 없는 행(과거 시즌)은 PA
    sf = pd.to_numeric(df["sf"], errors="coerce") if "sf" in df else pd.Series(float("nan"), index=df.index)
    df["obp_den"] = (df["ab"] + df["bb"] + df["hbp"] + sf.fillna(0)).where(sf.notna(), df["pa"])
    for extra in ("sf", "sh", "ci"):
        df[extra] = pd.to_numeric(df[extra], errors="coerce") if extra in df else float("nan")
    agg = df.groupby(["player_id", "season"]).agg(
        **{c: (c, "sum") for c in [*BAT_DB, "g", "obp_den"]},
        **{c: (c, lambda s: s.sum(min_count=1)) for c in ("sf", "sh", "ci")},
    ).reset_index()
    agg = agg[agg[BAT_DB].sum(axis=1) > 0]  # 로스터 등록용 0 행 제외
    for c in [*BAT_DB, "g", "obp_den"]:
        agg[c] = agg[c].astype(int)
    return _attach(add_batting_rates(agg), players)


def season_pitching(raw: pd.DataFrame, players: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    df = _prepare(raw, players, PIT_DB + ["ip"])
    warnings: list[str] = []
    if df.empty:
        return pd.DataFrame(), warnings

    def to_outs(v):
        try:
            return ip_to_outs(v)
        except ValueError:
            warnings.append(f"이닝 표기 오류 {v} → 소수 이닝으로 처리")
            return ip_to_outs(v, strict=False)

    df["outs"] = df["ip"].map(to_outs)
    agg = df.groupby(["player_id", "season"])[[*PIT_DB, "outs"]].sum().reset_index()
    agg = agg[agg[[*PIT_DB, "outs"]].sum(axis=1) > 0]
    for c in [*PIT_DB, "outs"]:
        agg[c] = agg[c].astype(int)
    return _attach(add_pitching_rates(agg), players), warnings


def career(season_df: pd.DataFrame, kind: str) -> pd.DataFrame:
    if season_df.empty:
        return season_df
    cols = [*BAT_DB, "obp_den"] if kind == "batting" else [*PIT_DB, "outs"]
    agg = season_df.groupby(["player_id", "number", "name"])[cols].sum().reset_index()
    agg["seasons"] = season_df.groupby("player_id")["season"].nunique().reindex(agg["player_id"]).values
    agg["season"] = "Career"
    if kind == "batting":
        return add_batting_rates(agg)
    return add_pitching_rates(agg)


def team_totals(df: pd.DataFrame, kind: str) -> dict:
    if df.empty:
        return {}
    if kind == "batting":
        s = df[[*BAT_DB, *(["obp_den"] if "obp_den" in df else [])]].sum()
        r = add_batting_rates(pd.DataFrame([s]))
    else:
        s = df[[*PIT_DB, "outs"]].sum()
        r = add_pitching_rates(pd.DataFrame([s]))
    return r.iloc[0].to_dict()


def _attach(df: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    info = players[["id", "number", "name"]].rename(columns={"id": "player_id"})
    out = df.merge(info, on="player_id", how="left")
    lead = ["season", "player_id", "number", "name"]
    return out[lead + [c for c in out.columns if c not in lead]]


def data_health(players, bat_raw, pit_raw, games) -> pd.DataFrame:
    """'데이터 점검' 탭용. 숫자가 어긋나는 구조적 원인을 목록으로."""
    rows = []

    def add(level, area, msg, n):
        if n:
            rows.append({"수준": level, "영역": area, "내용": msg, "건수": int(n)})

    for name, raw in (("batting_stats", bat_raw), ("pitching_stats", pit_raw), ("games", games)):
        if raw is None or raw.empty:
            continue
        bad = raw[~raw["season"].astype(str).str.match(SEASON_RE) & (raw["season"].astype(str) != "Career")]
        add("error", name, f"시즌 칸에 연도가 아닌 값 ({', '.join(sorted(set(bad['season'].astype(str))))}) — 화면에서 숨겨지지만 DB에 남아 있음", len(bad))
    for name, raw, cols in (("batting_stats", bat_raw, BAT_DB), ("pitching_stats", pit_raw, PIT_DB)):
        if raw is None or raw.empty:
            continue
        zero = raw[raw[cols].fillna(0).sum(axis=1) == 0]
        add("info", name, "모든 값이 0인 행(로스터 등록용 자리표시)", len(zero))
        valid = raw[raw["season"].astype(str).str.match(SEASON_RE)]
        mix = valid.groupby(["player_id", "season"])["game_id"].agg(lambda s: s.notna().any() and s.isna().any())
        add("warning", name, "같은 선수·시즌에 요약 행과 경기별 행이 섞여 있음 (단순 합산 시 이중 집계)", mix.sum())
    if pit_raw is not None and not pit_raw.empty:
        bad_ip = 0
        for v in pit_raw["ip"].dropna():
            try:
                ip_to_outs(v)
            except ValueError:
                bad_ip += 1
        add("error", "pitching_stats", "이닝 표기 오류(소수점 아래 3 이상)", bad_ip)
    cp = canonical_players(players)
    add("warning", "players", "(배번, 이름)이 같은 중복 선수 레코드", (cp["id"] != cp["canonical_id"]).sum())
    name_conflict = players.groupby(players["name"].str.replace(r"\s+", "", regex=True))["number"].nunique()
    add("info", "players", "같은 이름에 배번이 여러 개 (동명이인 또는 배번 변경)", (name_conflict > 1).sum())
    return pd.DataFrame(rows, columns=["수준", "영역", "내용", "건수"])
