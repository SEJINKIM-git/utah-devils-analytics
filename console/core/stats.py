"""
지표 계산의 단일 원천(single source of truth).

기존 Next.js 플랫폼에서는 ERA/WHIP/OBP 공식이 10곳 이상에 흩어져 있었고
(records, players/[id], SeasonChart, SearchBar, analyze, analyze-team, goals, game-review …)
일부는 ERA 기준 이닝이 9, 나머지는 5였으며 이닝 표기(3.1 = 3⅓)를 소수로 그대로 나누는 곳도 있었다.
이 모듈 하나만 고치면 콘솔 전체 지표가 함께 바뀐다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

# ── 규정 ─────────────────────────────────────────────────────────────────────
# 클럽 규정: 5이닝제 기준 ERA (헌법 6장 ERA 기준 이닝 개정 시 이 값만 변경)
ERA_BASE_INNINGS = 5
# 기존 플랫폼은 WHIP = (피안타 + 볼넷) / 이닝. 기록지(엑셀)는 사구까지 포함한다.
WHIP_INCLUDES_HBP = False

BATTING_COUNTS = ["g", "pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"]
PITCHING_COUNTS = ["g", "w", "l", "sv", "hld", "outs", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed", "bf", "ab_against"]


# ── 이닝 표기 ────────────────────────────────────────────────────────────────
class InvalidInningsError(ValueError):
    pass


def ip_to_outs(ip, *, strict: bool = True) -> int:
    """야구식 이닝 표기 → 아웃카운트. 46.2 → 140, 3.1 → 10.

    소수 첫째 자리가 0/1/2가 아니면(예: 13.5) 표기 오류다.
    strict=False면 이미 소수 이닝으로 보고 반올림한다.
    """
    if ip is None or (isinstance(ip, float) and math.isnan(ip)) or ip == "":
        return 0
    value = float(ip)
    if value < 0:
        raise InvalidInningsError(f"음수 이닝: {ip}")
    full = math.floor(value + 1e-9)
    frac = round((value - full) * 10, 6)
    digit = round(frac)
    if abs(frac - digit) < 1e-6 and digit in (0, 1, 2):
        return full * 3 + digit
    if strict:
        raise InvalidInningsError(f"이닝 표기 오류: {ip} (소수점 아래는 0·1·2만 가능)")
    return round(value * 3)


def outs_to_ip(outs: int) -> str:
    """아웃카운트 → 표기. 140 → '46.2'"""
    outs = int(outs or 0)
    full, rem = divmod(outs, 3)
    return f"{full}.{rem}" if rem else f"{full}"


def outs_to_innings(outs: int) -> float:
    return (outs or 0) / 3


# ── 비율 지표 ────────────────────────────────────────────────────────────────
def _div(n, d):
    return n / d if d else None


@dataclass(frozen=True)
class BattingRates:
    avg: float | None
    obp: float | None
    slg: float | None
    ops: float | None


def batting_rates(hits, ab, pa, bb, hbp, doubles, triples, hr) -> BattingRates:
    singles = hits - doubles - triples - hr
    tb = singles + 2 * doubles + 3 * triples + 4 * hr
    avg = _div(hits, ab)
    # 클럽 기록지·기존 플랫폼 공통: 출루율 분모 = 타석
    obp = _div(hits + bb + hbp, pa)
    slg = _div(tb, ab)
    ops = obp + slg if obp is not None and slg is not None else None
    return BattingRates(avg, obp, slg, ops)


@dataclass(frozen=True)
class PitchingRates:
    era: float | None
    whip: float | None
    k_per_base: float | None
    bb_per_base: float | None
    baa: float | None


def pitching_rates(outs, er, ha, bb, hbp, so, ab_against=0) -> PitchingRates:
    inn = outs_to_innings(outs)
    era = _div(er * ERA_BASE_INNINGS, inn)
    whip_num = ha + bb + (hbp if WHIP_INCLUDES_HBP else 0)
    return PitchingRates(
        era=era,
        whip=_div(whip_num, inn),
        k_per_base=_div(so * ERA_BASE_INNINGS, inn),
        bb_per_base=_div(bb * ERA_BASE_INNINGS, inn),
        baa=_div(ha, ab_against),
    )


# ── DataFrame 단위 ────────────────────────────────────────────────────────────
def add_batting_rates(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    rates = [
        batting_rates(r.hits, r.ab, r.pa, r.bb, r.hbp, r.doubles, r.triples, r.hr)
        for r in out.itertuples()
    ]
    for key in ("avg", "obp", "slg", "ops"):
        out[key] = [getattr(x, key) for x in rates]
    return out


def add_pitching_rates(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    rates = [
        pitching_rates(r.outs, r.er, r.ha, r.bb, r.hbp, r.so, getattr(r, "ab_against", 0) or 0)
        for r in out.itertuples()
    ]
    out["ip"] = out["outs"].map(outs_to_ip)
    out["era"] = [x.era for x in rates]
    out["whip"] = [x.whip for x in rates]
    out[f"k_{ERA_BASE_INNINGS}"] = [x.k_per_base for x in rates]
    out[f"bb_{ERA_BASE_INNINGS}"] = [x.bb_per_base for x in rates]
    return out


def fmt_rate(value, digits: int = 3) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "---"
    text = f"{value:.{digits}f}"
    return text[1:] if digits == 3 and text.startswith("0.") else text
