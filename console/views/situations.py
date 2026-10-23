import pandas as pd
import plotly.express as px
import streamlit as st

from core.session import actor, get_repo, load_core, season_picker
from core.ui import empty_state, style_fig

# DB enum decision_type과 같은 목록 (분석 플랫폼 lib/decisionTypes.ts와 동일, infield_in·no_doubles는 sql/002)
DECISION = {"pitching_change": "투수 교체", "intentional_walk": "고의사구", "defensive_alignment": "수비 시프트",
            "infield_in": "내야 전진", "no_doubles": "노더블 얼라인", "steal_attempt": "도루 시도", "bunt": "번트",
            "hit_and_run": "히트앤런", "pinch_hitter": "대타", "pinch_runner": "대주자", "other": "기타"}
EVAL = {"correct": "적중", "incorrect": "실패", "ambiguous": "판단 보류", "pending": "평가 전"}
BASES = {0: "주자 없음", 1: "1루", 2: "2루", 3: "1·2루", 4: "3루", 5: "1·3루", 6: "2·3루", 7: "만루"}

repo = get_repo()
data = load_core()
season = season_picker(data)
st.title("상황 센터")

tab_hub, tab_log = st.tabs(["판단 기록 분석", "새 상황 기록"])

with tab_hub:
    df = repo.situations(None if season == "Career" else season)
    if df.empty:
        empty_state("기록된 경기 상황이 없습니다." + (" (데모 모드에서는 DB 상황 기록을 불러오지 않습니다)" if repo.read_only else ""))
    else:
        df["판단"] = df["decision_type"].map(DECISION).fillna(df["decision_type"])
        df["평가"] = df["retrospective_eval"].map(EVAL).fillna("평가 전")
        evaluated = df[df["retrospective_eval"].isin(["correct", "incorrect"])]
        c = st.columns(4)
        c[0].metric("기록된 상황", len(df))
        c[1].metric("고레버리지", int(df["leverage_class"].isin(["high", "critical"]).sum()))
        c[2].metric("판단 적중률", f"{(evaluated.retrospective_eval == 'correct').mean():.0%}" if len(evaluated) else "---")
        c[3].metric("평가 대기", int((df["retrospective_eval"] == "pending").sum()))

        a, b = st.columns(2, gap="large")
        by = df.groupby(["판단", "평가"]).size().reset_index(name="건수")
        a.plotly_chart(style_fig(px.bar(by, x="판단", y="건수", color="평가", title="판단 유형별 결과",
                                        color_discrete_map={"적중": "#2b8a3e", "실패": "#c2255c", "판단 보류": "#868e96", "평가 전": "#ced4da"})),
                       width="stretch")
        lev = df.groupby(["leverage_class", "평가"]).size().reset_index(name="건수")
        b.plotly_chart(style_fig(px.bar(lev, x="leverage_class", y="건수", color="평가", title="레버리지별 결과",
                                        category_orders={"leverage_class": ["low", "medium", "high", "critical"]})),
                       width="stretch")

        f1, f2 = st.columns(2)
        types = f1.multiselect("판단 유형", sorted(df["판단"].dropna().unique()))
        levs = f2.multiselect("레버리지", ["low", "medium", "high", "critical"])
        view = df[(df["판단"].isin(types) if types else True) & (df["leverage_class"].isin(levs) if levs else True)]
        view = view.assign(주자=view["base_state"].map(BASES), 이닝=view["inning"].astype(str) + view["inning_half"].map({"top": "초", "bottom": "말"}).fillna(""))
        st.dataframe(view[["game_date", "opponent", "이닝", "out_count", "주자", "score_diff", "leverage_index", "판단",
                           "decision_summary", "outcome", "평가", "retrospective_note"]],
                     hide_index=True, width="stretch",
                     column_config={"game_date": "날짜", "opponent": "상대", "out_count": "아웃", "score_diff": "점수차",
                                    "leverage_index": st.column_config.NumberColumn("LI", format="%.2f"),
                                    "decision_summary": "판단 내용", "outcome": "결과", "retrospective_note": "복기"})

with tab_log:
    if repo.read_only:
        st.info("데모 모드에서는 저장할 수 없습니다.", icon=":material/lock:")
    games = data["games"]
    games = games[games["season"].astype(str) == season] if not games.empty and season != "Career" else games
    if games.empty:
        empty_state("이 시즌에 등록된 경기가 없습니다. 상황은 경기에 연결해야 합니다.")
    else:
        roster = data["players"].sort_values("number")
        names = {None: "—", **{r.id: f"{r.number}. {r.name}" for r in roster.itertuples()}}
        with st.form("situation", clear_on_submit=True):
            g = st.selectbox("경기", games.sort_values("date", ascending=False).to_dict("records"),
                             format_func=lambda r: f"{r['date']} vs {r['opponent']}")
            c = st.columns(4)
            inning = c[0].number_input("이닝", 1, 12, 1)
            half = c[1].radio("초/말", ["top", "bottom"], format_func={"top": "초", "bottom": "말"}.get, horizontal=True)
            outs = c[2].radio("아웃", [0, 1, 2], horizontal=True)
            base = c[3].selectbox("주자", list(BASES), format_func=BASES.get)
            c = st.columns(4)
            us = c[0].number_input("우리 점수", 0, 99, 0)
            them = c[1].number_input("상대 점수", 0, 99, 0)
            batter = c[2].selectbox("타자", list(names), format_func=names.get)
            pitcher = c[3].selectbox("투수", list(names), format_func=names.get)
            note = st.text_input("상황 메모")
            st.divider()
            dtype = st.selectbox("판단 유형", list(DECISION), format_func=DECISION.get)
            summary = st.text_input("판단 내용", placeholder="예: 6회 무사 1루, 번트 대신 강공")
            rationale = st.text_area("근거", height=80)
            submitted = st.form_submit_button("기록 저장", type="primary", disabled=repo.read_only)
        if submitted:
            if not summary.strip():
                st.error("판단 내용을 입력하세요.")
            else:
                res = repo.log_situation(
                    {"game_id": int(g["id"]), "season": season, "inning": int(inning), "inning_half": half,
                     "base_state": int(base), "out_count": int(outs), "score_us": int(us), "score_them": int(them),
                     "batter_id": batter, "pitcher_id": pitcher, "context_note": note or None},
                    {"decision_type": dtype, "decision_summary": summary.strip(), "rationale": rationale or None,
                     "retrospective_eval": "pending"},
                    actor())
                (st.success if res.ok else st.error)(res.message)
