import streamlit as st

from core.session import load_core, season_frames, season_picker
from core.ui import batting_table, empty_state, pitching_table

data = load_core()
season = season_picker(data)
bat, pit = season_frames(data, season)

st.title("기록")
tab_b, tab_p = st.tabs(["타자", "투수"])

with tab_b:
    if bat.empty:
        empty_state("타자 기록이 없습니다.")
    else:
        c1, c2 = st.columns([1, 3])
        min_pa = c1.number_input("최소 타석", 0, int(bat.pa.max()), 0, step=5)
        q = c2.text_input("선수 검색", placeholder="이름 또는 배번")
        view = bat[bat.pa >= min_pa]
        if q:
            view = view[view["name"].str.contains(q) | (view["number"].astype(str) == q.strip())]
        batting_table(view.sort_values("ops", ascending=False), extra_front=["season"] if season == "Career" else None)
        st.download_button("CSV 다운로드", view.to_csv(index=False).encode("utf-8-sig"),
                           f"batting_{season}.csv", "text/csv", icon=":material/download:")

with tab_p:
    if pit.empty:
        empty_state("투수 기록이 없습니다.")
    else:
        min_outs = st.number_input("최소 이닝", 0, int(pit.outs.max() // 3), 0) * 3
        view = pit[pit.outs >= min_outs]
        pitching_table(view.sort_values("outs", ascending=False))
        st.download_button("CSV 다운로드", view.to_csv(index=False).encode("utf-8-sig"),
                           f"pitching_{season}.csv", "text/csv", icon=":material/download:")
