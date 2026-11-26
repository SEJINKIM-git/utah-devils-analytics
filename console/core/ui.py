"""표시용 공통 요소: 컬럼 라벨·포맷, 차트 색."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .metrics import metric_short_name
from .stats import ERA_BASE_INNINGS, fmt_rate

PRIMARY = "#0058bc"
PALETTE = ["#0058bc", "#e8590c", "#2b8a3e", "#7048e8", "#c2255c", "#1098ad"]

# 지표 이름은 지표 사전(lib/metrics/registry.json)이 원본이다. 여기서는 표의 칸 이름 → 지표 코드만 잇는다.
_BAT_CODES = {"g": "G", "pa": "PA", "ab": "AB", "runs": "R", "hits": "H", "doubles": "2B", "triples": "3B", "hr": "HR",
              "rbi": "RBI", "bb": "BB", "hbp": "HBP", "so": "SO", "sb": "SB", "avg": "AVG", "obp": "OBP", "slg": "SLG", "ops": "OPS"}
_PIT_CODES = {"w": "W", "l": "L", "sv": "SV", "hld": "HLD", "ip": "IP", "ha": "HA", "runs_allowed": "RA", "er": "ER",
              "bb": "BBA", "hbp": "HBA", "so": "K", "hr_allowed": "HRA", "era": "ERA", "whip": "WHIP",
              f"k_{ERA_BASE_INNINGS}": f"K{ERA_BASE_INNINGS}", f"bb_{ERA_BASE_INNINGS}": f"BB{ERA_BASE_INNINGS}"}

BAT_LABELS = {"number": "배번", "name": "이름", "season": "시즌", **{col: metric_short_name(code) for col, code in _BAT_CODES.items()}}
PIT_LABELS = {"number": "배번", "name": "이름", "season": "시즌", **{col: metric_short_name(code) for col, code in _PIT_CODES.items()}}

BAT_VIEW = ["number", "name", "g", "pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb",
            "avg", "obp", "slg", "ops"]
PIT_VIEW = ["number", "name", "w", "l", "sv", "hld", "ip", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed",
            "era", "whip", f"k_{ERA_BASE_INNINGS}"]


def _config(labels, rate3, rate2):
    cfg = {k: st.column_config.Column(v) for k, v in labels.items()}
    for k in rate3:
        cfg[k] = st.column_config.NumberColumn(labels[k], format="%.3f")
    for k in rate2:
        cfg[k] = st.column_config.NumberColumn(labels[k], format="%.2f")
    return cfg


def _height(df):
    return min(38 + 35 * max(len(df), 1), 900)


def batting_table(df: pd.DataFrame, extra_front: list[str] | None = None, **kw):
    kw.setdefault("height", _height(df))
    cols = [c for c in (extra_front or []) + BAT_VIEW if c in df.columns and (c != "g" or df["g"].sum() > 0)]
    st.dataframe(df[cols], hide_index=True, width="stretch",
                 column_config=_config(BAT_LABELS, ["avg", "obp", "slg", "ops"], []), **kw)


def pitching_table(df: pd.DataFrame, extra_front: list[str] | None = None, **kw):
    kw.setdefault("height", _height(df))
    cols = [c for c in (extra_front or []) + PIT_VIEW if c in df.columns]
    st.dataframe(df[cols], hide_index=True, width="stretch",
                 column_config=_config(PIT_LABELS, [], ["era", "whip", f"k_{ERA_BASE_INNINGS}"]), **kw)


def rate(v, digits=3):
    return fmt_rate(v, digits)


def empty_state(msg: str):
    st.info(msg, icon=":material/inbox:")


def style_fig(fig, height=360):
    fig.update_layout(height=height, margin=dict(l=8, r=8, t=36, b=8), paper_bgcolor="rgba(0,0,0,0)",
                      plot_bgcolor="rgba(0,0,0,0)", font=dict(family="Inter, sans-serif", color="#1a1b1f"),
                      colorway=PALETTE, legend=dict(orientation="h", y=-0.15))
    fig.update_xaxes(showgrid=False)
    fig.update_yaxes(gridcolor="rgba(65,71,85,0.08)")
    return fig


def hbar(df, x, y, fmt, color=PRIMARY):
    """가로 막대 순위 차트. 막대 수에 맞춰 높이를 정하고 값 라벨이 잘리지 않게 여유를 둔다."""
    import plotly.express as px

    fig = px.bar(df, x=x, y=y, orientation="h", text=df[x].map(fmt))
    fig.update_traces(marker_color=color, textposition="outside", cliponaxis=False, width=0.6)
    top = float(df[x].max() or 1)
    fig.update_xaxes(range=[0, top * 1.18], title=None)
    fig.update_yaxes(title=None)
    return style_fig(fig, height=max(160, 44 * len(df) + 60))
