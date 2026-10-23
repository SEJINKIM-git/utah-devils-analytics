"""Devils Console — Utah Devils 운영진용 데이터 관리·분석 콘솔.

실행: streamlit run app.py
"""
import streamlit as st

from core.session import demo_mode, get_repo, refresh, require_login

st.set_page_config(page_title="Devils Console", page_icon="⚾", layout="wide")
require_login()

pages = {
    "분석": [
        st.Page("views/dashboard.py", title="대시보드", icon=":material/space_dashboard:", default=True),
        st.Page("views/records.py", title="기록", icon=":material/table_chart:"),
        st.Page("views/player.py", title="선수 상세", icon=":material/person:"),
        st.Page("views/compare.py", title="선수 비교", icon=":material/compare_arrows:"),
        st.Page("views/situations.py", title="상황 센터", icon=":material/psychology:"),
        st.Page("views/ai_report.py", title="AI 리포트", icon=":material/auto_awesome:"),
    ],
    "데이터 관리": [
        st.Page("views/upload.py", title="기록지 업로드", icon=":material/upload_file:"),
        st.Page("views/manage.py", title="데이터 수정·점검", icon=":material/edit_note:"),
    ],
}

with st.sidebar:
    repo = get_repo()
    st.caption(f"연결: {repo.label}")
    if demo_mode():
        st.info("secrets가 없어 엑셀 기록지로 실행 중입니다. 저장 기능은 꺼져 있습니다.", icon=":material/info:")
    else:
        st.caption(f"로그인: {st.session_state.get('actor')}")
    if st.button("새로고침", icon=":material/refresh:", width="stretch"):
        refresh()
        st.rerun()

st.navigation(pages).run()
