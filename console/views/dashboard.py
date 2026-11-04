import pandas as pd
import plotly.express as px
import streamlit as st

from core import aggregate as agg
from core.session import load_core, season_frames, season_picker
from core.stats import ERA_BASE_INNINGS
from core.ui import empty_state, hbar, rate, style_fig

data = load_core()
season = season_picker(data)
bat, pit = season_frames(data, season)

st.title(f"{season} 시즌" if season != "Career" else "통산")
st.caption(f"ERA는 {ERA_BASE_INNINGS}이닝 기준 · 이닝은 아웃카운트로 합산 · 통산은 시즌 합")

if bat.empty and pit.empty:
    empty_state("이 시즌에 저장된 기록이 없습니다. '기록지 업로드'에서 시즌 파일을 올리세요.")
    st.stop()

tb, tp = agg.team_totals(bat, "batting"), agg.team_totals(pit, "pitching")
c = st.columns(6)
c[0].metric("팀 타율", rate(tb.get("avg")))
c[1].metric("팀 출루율", rate(tb.get("obp")))
c[2].metric("팀 OPS", rate(tb.get("ops")))
c[3].metric("팀 ERA", rate(tp.get("era"), 2))
c[4].metric("팀 WHIP", rate(tp.get("whip"), 2))
c[5].metric("도루", int(tb.get("sb", 0) or 0))

st.space("medium")
left, right = st.columns(2, gap="large")
min_pa = max(5, int(bat["pa"].quantile(0.4))) if not bat.empty else 0
with left:
    st.subheader("타자 OPS")
    st.caption(f"타석 {min_pa} 이상")
    q = bat[bat.pa >= min_pa].nlargest(10, "ops")
    if not q.empty:
        st.plotly_chart(hbar(q.sort_values("ops"), "ops", "name", rate), width="stretch")
with right:
    st.subheader("투수 ERA")
    min_outs = 15
    st.caption("5이닝(15아웃) 이상 · 낮을수록 좋음")
    q = pit[pit.outs >= min_outs].nsmallest(10, "era") if not pit.empty else pit
    if not q.empty:
        st.plotly_chart(hbar(q.sort_values("era", ascending=False), "era", "name", lambda v: rate(v, 2), "#e8590c"),
                        width="stretch")
    else:
        empty_state("기준 이닝을 채운 투수가 없습니다.")

if season == "Career" and not data["bat"].empty:
    st.subheader("시즌별 팀 추이")
    rows = []
    for s, part in data["bat"].groupby("season"):
        t = agg.team_totals(part, "batting")
        rows.append({"시즌": s, "지표": "OPS", "값": t["ops"]})
        rows.append({"시즌": s, "지표": "타율", "값": t["avg"]})
    for s, part in data["pit"].groupby("season"):
        rows.append({"시즌": s, "지표": "ERA", "값": agg.team_totals(part, "pitching")["era"]})
    trend = pd.DataFrame(rows)
    a, b = st.columns(2, gap="large")
    a.plotly_chart(style_fig(px.line(trend[trend["지표"] != "ERA"], x="시즌", y="값", color="지표", markers=True)), width="stretch")
    b.plotly_chart(style_fig(px.line(trend[trend["지표"] == "ERA"], x="시즌", y="값", markers=True,
                                     color_discrete_sequence=["#e8590c"]).update_layout(yaxis_title="ERA")), width="stretch")

health = data["health"]
problems = health[health["수준"].isin(["error", "warning"])] if not health.empty else health
if not problems.empty:
    with st.expander(f"데이터 점검 — 확인 필요 {len(problems)}건", icon=":material/warning:"):
        st.dataframe(problems, hide_index=True, width="stretch")
        st.page_link("views/manage.py", label="데이터 수정·점검으로 이동", icon=":material/chevron_right:")
