import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from core.session import load_core, season_frames, season_picker
from core.ui import PALETTE, batting_table, empty_state, pitching_table, style_fig

data = load_core()
season = season_picker(data)
bat, pit = season_frames(data, season)

st.title("선수 비교")
kind = st.segmented_control("구분", ["타자", "투수"], default="타자")
df = bat if kind == "타자" else pit
if df.empty:
    empty_state("비교할 기록이 없습니다.")
    st.stop()

labels = {r.player_id: f"{r.number}. {r.name}" for r in df.itertuples()}
picked = st.multiselect("선수 (2~4명)", list(labels), format_func=labels.get, max_selections=4)
if len(picked) < 2:
    st.caption("두 명 이상 고르면 비교 차트가 나타납니다.")
    st.stop()

# 레이더: 같은 시즌 선수 분포 안에서의 백분위 (0~100). 낮을수록 좋은 지표는 뒤집는다.
if kind == "타자":
    pool = df[df.pa >= max(5, df.pa.quantile(0.25))]
    axes = {"avg": "타율", "obp": "출루율", "slg": "장타율", "sb": "도루", "bb_rate": "볼넷%", "k_rate": "삼진%(역)"}
    pool = pool.assign(bb_rate=pool.bb / pool.pa, k_rate=-(pool.so / pool.pa))
    sel = df[df.player_id.isin(picked)].assign(bb_rate=lambda d: d.bb / d.pa, k_rate=lambda d: -(d.so / d.pa))
else:
    pool = df[df.outs >= 9]
    axes = {"era": "ERA(역)", "whip": "WHIP(역)", "k_5": "K/5", "bb_5": "BB/5(역)", "outs": "이닝"}
    flip = lambda d: d.assign(era=-d.era, whip=-d.whip, bb_5=-d.bb_5)  # noqa: E731
    pool, sel = flip(pool), flip(df[df.player_id.isin(picked)])

pct = lambda col, v: float((pool[col] <= v).mean() * 100) if len(pool) and pd.notna(v) else 0  # noqa: E731
fig = go.Figure()
for i, r in enumerate(sel.itertuples()):
    vals = [pct(c, getattr(r, c)) for c in axes]
    fig.add_trace(go.Scatterpolar(r=vals + vals[:1], theta=list(axes.values()) + [list(axes.values())[0]],
                                  name=labels[r.player_id], fill="toself", opacity=0.55, line_color=PALETTE[i]))
fig.update_layout(polar=dict(radialaxis=dict(range=[0, 100], showticklabels=False), bgcolor="rgba(0,0,0,0)"))
st.plotly_chart(style_fig(fig, 420), width="stretch")
st.caption(f"{season} {'타석 상위 75%' if kind == '타자' else '3이닝 이상'} 선수 중 백분위. (역) 표시는 낮을수록 좋은 지표를 뒤집은 값.")

chosen = df[df.player_id.isin(picked)]
(batting_table if kind == "타자" else pitching_table)(chosen)
