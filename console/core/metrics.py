"""
지표 사전 (분석 플랫폼 lib/metrics/index.ts와 같은 사전).

코드·이름·공식·표시 형식의 원본은 저장소의 lib/metrics/registry.json 하나다.
이 모듈은 그 JSON을 읽어 코드 → core/stats.py의 기존 함수로 연결한다. 계산식을 여기서 새로 쓰지 않는다.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from .stats import ERA_BASE_INNINGS, batting_rates, ip_to_outs, outs_to_innings, outs_to_ip, pitching_rates

REGISTRY_PATH = Path(__file__).resolve().parents[2] / "lib" / "metrics" / "registry.json"

# 합산된 기록(dict)의 칸 이름 — 플랫폼의 BattingTotals / PitchingTotals와 같다. 투구 이닝만 아웃 수(outs)로 든다.
BATTING_FIELDS = ("g", "pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb", "obp_den")
PITCHING_FIELDS = ("g", "w", "l", "sv", "hld", "outs", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed")

FALLBACK = "---"


@lru_cache(maxsize=1)
def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def metrics() -> list[dict]:
    return load_registry()["metrics"]


@lru_cache(maxsize=1)
def _by_code() -> dict[str, dict]:
    return {m["code"].upper(): m for m in metrics()}


def get_metric(code: str) -> dict | None:
    return _by_code().get(str(code or "").strip().upper())


def require_metric(code: str) -> dict:
    metric = get_metric(code)
    if metric is None:
        raise KeyError(f"지표 사전에 없는 코드: {code}")
    return metric


def metric_name(code: str, lang: str = "ko") -> str:
    metric = require_metric(code)
    return metric["nameKo"] if lang == "ko" else metric["nameEn"]


def metric_short_name(code: str, lang: str = "ko") -> str:
    """표 머리글용 짧은 이름: 한국어는 '출루율', 영어는 'OBP'."""
    metric = require_metric(code)
    if lang == "ko":
        return metric.get("shortKo") or metric["nameKo"]
    return metric.get("shortEn") or metric["code"]


def _num(value) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 0
    return value


def _outs(totals: dict) -> int:
    """투구 합계의 아웃 수. outs가 없으면 야구식 이닝 표기(ip)에서 바꾼다."""
    if totals.get("outs") is not None:
        return int(totals["outs"])
    return ip_to_outs(totals.get("ip"))


def _batting(totals: dict):
    return batting_rates(_num(totals.get("hits")), _num(totals.get("ab")), _num(totals.get("pa")), _num(totals.get("bb")),
                         _num(totals.get("hbp")), _num(totals.get("doubles")), _num(totals.get("triples")), _num(totals.get("hr")),
                         sf=totals.get("sf"), obp_den=totals.get("obp_den"))


def _pitching(totals: dict):
    return pitching_rates(_outs(totals), _num(totals.get("er")), _num(totals.get("ha")), _num(totals.get("bb")),
                          _num(totals.get("hbp")), _num(totals.get("so")))


# 코드 → 기존 함수 (stats.py). 사전의 모든 rate 지표가 여기 있어야 한다 — tests/test_metrics.py가 확인한다.
BATTING_RATES = {
    "AVG": lambda t: _batting(t).avg,
    "OBP": lambda t: _batting(t).obp,
    "SLG": lambda t: _batting(t).slg,
    "OPS": lambda t: _batting(t).ops,
}
PITCHING_RATES = {
    "ERA": lambda t: _pitching(t).era,
    "WHIP": lambda t: _pitching(t).whip,
    f"K{ERA_BASE_INNINGS}": lambda t: _pitching(t).k_per_base,
    f"BB{ERA_BASE_INNINGS}": lambda t: _pitching(t).bb_per_base,
}


def is_computable(code: str) -> bool:
    metric = get_metric(code)
    if metric is None:
        return False
    if metric["type"] == "innings":
        return metric["kind"] == "pitching"
    if metric["type"] == "count":
        allowed = BATTING_FIELDS if metric["kind"] == "batting" else PITCHING_FIELDS
        return bool(metric.get("fields")) and all(f in allowed for f in metric["fields"])
    return metric["code"] in (BATTING_RATES if metric["kind"] == "batting" else PITCHING_RATES)


def compute(code: str, totals: dict):
    """합산된 기록에서 지표 값 하나. 계산할 수 없으면(타수 0, 이닝 0) None."""
    metric = require_metric(code)
    if metric["type"] == "innings":
        return outs_to_innings(_outs(totals))
    if metric["type"] == "count":
        return sum(_num(totals.get(f)) for f in metric["fields"])
    table = BATTING_RATES if metric["kind"] == "batting" else PITCHING_RATES
    return table[metric["code"]](totals)


def fmt(code: str, value, leading_zero: bool | None = None) -> str:
    """사전의 자릿수·앞자리 0 규칙으로 표기한다. 이닝은 야구식 표기(46⅔ → '46.2')."""
    metric = require_metric(code)
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return FALLBACK
    if metric["type"] == "innings":
        return outs_to_ip(round(value * 3))
    if metric["type"] == "count":
        return str(int(value))
    text = f"{value:.{metric['digits']}f}"
    keep_zero = metric["leadingZero"] if leading_zero is None else leading_zero
    return text[1:] if not keep_zero and text.startswith("0.") else text
