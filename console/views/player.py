import pandas as pd
import plotly.express as px
import streamlit as st

from core import aggregate as agg
from core.session import load_core
from core.ui import batting_table, empty_state, pitching_table, rate, style_fig

data = load_core()
players = agg.canonical_players(data["players"])
players = players[players["id"] == players["canonical_id"]]
active = set(data["bat"].get("player_id", [])) | set(data["pit"].get("player_id", []))
players = players[players["id"].isin(active)].sort_values(["number", "name"])

st.title("선수 상세")
if players.empty:
    empty_state("기록이 있는 선수가 없습니다.")
    st.stop()

labels = {r.id: f"{r.number}. {r.name}" for r in players.itertuples()}
pid = st.selectbox("선수", list(labels), format_func=labels.get, index=None, placeholder="선수를 선택하세요")
if pid is None:
    st.stop()

bat = data["bat"][data["bat"].player_id == pid].sort_values("season") if not data["bat"].empty else pd.DataFrame()
pit = data["pit"][data["pit"].player_id == pid].sort_values("season") if not data["pit"].empty else pd.DataFrame()

cb = agg.career(bat, "batting") if not bat.empty else pd.DataFrame()
cp = agg.career(pit, "pitching") if not pit.empty else pd.DataFrame()
m = st.columns(5)
if not cb.empty:
    r = cb.iloc[0]
    m[0].metric("통산 타율", rate(r.avg))
    m[1].metric("통산 OPS", rate(r.ops))
    m[2].metric("통산 도루", int(r.sb))
if not cp.empty:
    r = cp.iloc[0]
    m[3].metric("통산 ERA", rate(r.era, 2))
    m[4].metric("통산 이닝", r.ip)

if not bat.empty:
    st.subheader("타격")
    if len(bat) > 1:
        trend = bat.melt(id_vars="season", value_vars=["avg", "obp", "slg"], var_name="지표", value_name="값")
        trend["지표"] = trend["지표"].map({"avg": "타율", "obp": "출루율", "slg": "장타율"})
        st.plotly_chart(style_fig(px.line(trend, x="season", y="값", color="지표", markers=True), 300), width="stretch")
    batting_table(pd.concat([bat, cb]), extra_front=["season"])

if not pit.empty:
    st.subheader("투구")
    if len(pit) > 1:
        st.plotly_chart(style_fig(px.line(pit, x="season", y=["era", "whip"], markers=True), 300), width="stretch")
    pitching_table(pd.concat([pit, cp]), extra_front=["season"])

