"""기록지 업로드: 파싱 → 검증 → DB와 비교 → 확인 후 저장 (시즌 단위 교체, 원자적, 감사 로그)."""
import hashlib
import io

import pandas as pd
import streamlit as st

from core.diffing import COMPARE_B, COMPARE_P, diff, shrink_report
from core.game_upload_ui import UnreadableWorkbook, is_game_file, render_game_files
from core.parser import parse_workbook
from core.session import actor, get_repo, load_core, refresh
from core.validation import check_cross_files, validate

repo = get_repo()
st.title("기록지 업로드")
st.caption("경기 기록지(v3.0)는 그 경기를, 시즌 누적 기록지는 그 시즌 요약 기록을 교체합니다. 같은 파일을 여러 번 올려도 결과는 같습니다.")

files = st.file_uploader("기록지 (.xlsx, .xlsm)", type=["xlsx", "xlsm"], accept_multiple_files=True)
if not files:
    with st.expander("어떤 파일을 올리나요?"):
        st.markdown(
            "**경기 기록지 v3.0** — `10_17 VS 상대 경기 기록.xlsx`\n"
            "- 타석 결과 표기에서 직접 계산하고, 경기 정보·검수 시트를 함께 확인합니다.\n"
            "- 검수가 끝나지 않았거나 점수·아웃 대조가 맞지 않으면 경고를 보여 줍니다 (저장은 가능).\n\n"
            "**시즌 누적 기록지**\n"
            "- `2025 Utah Devils Player Stat.xlsx`처럼 **연도가 들어간 시즌 파일**\n"
            "- 시즌 시트(`2025`)의 선수 행이 저장됩니다. 학기 시트(`25 Spring`)와 경기별 시트(`25 Spring (타자)`)는 **교차 검증용**입니다.\n"
            "- 통산 파일은 저장하지 않습니다. 통산은 시즌 합으로 계산합니다. (통산 파일을 함께 올리면 시즌 파일과 대조해 줍니다)\n"
            "- 시트 하단 '통산'·'○○ 시즌' 합계 행은 저장하지 않고 검증에만 씁니다.")
    st.stop()


@st.cache_data(show_spinner="기록지 분석 중…")
def parse_cached(digest: str, name: str, raw: bytes):
    pw = parse_workbook(io.BytesIO(raw), name)
    return pw, validate(pw)


# 파일 분류: 경기 기록지 / 시즌 누적 기록지 / 열 수 없는 파일 (하나가 깨져도 나머지는 계속 처리)
game_files, season_files = [], []
for f in files:
    try:
        (game_files if is_game_file(f) else season_files).append(f)
    except UnreadableWorkbook as e:
        st.error(str(e), icon=":material/broken_image:")

if game_files:
    render_game_files(game_files, repo, load_core())
if not season_files:
    st.stop()
if game_files:
    st.header("시즌 누적 기록지")

parsed = []
for f in season_files:
    try:
        parsed.append(parse_cached(hashlib.sha1(f.getvalue()).hexdigest(), f.name, f.getvalue()))
    except Exception as e:
        st.error(f"{f.name}: 기록지를 읽지 못했습니다 — {type(e).__name__}: {e}. "
                 "시즌 시트(예: 2025) 구조가 공식 기록지와 같은지 확인해 주세요.", icon=":material/error:")
if not parsed:
    st.stop()
cross = check_cross_files([pw for pw, _ in parsed])

LEVEL = {"error": "🔴 오류", "warning": "🟠 경고", "info": "⚪ 참고"}
ISSUE_COLS = {"수준": st.column_config.TextColumn(width="small"), "시트": st.column_config.TextColumn(width="small"),
              "행": st.column_config.NumberColumn(width="small", format="%d"), "내용": st.column_config.TextColumn(width="large")}

for pw, issues in parsed:
    with st.container():
        st.subheader(pw.source)
        sheets = pd.DataFrame(pw.sheets)
        type_label = {"summary": "요약", "games": "경기별", "ignore": "건너뜀", "unknown": "알 수 없음"}
        st.caption(" · ".join(f"{r.sheet} → {type_label.get(r.type, r.type)}" for r in sheets.itertuples()))
        counts = pd.Series([i.level for i in issues]).value_counts()
        c = st.columns(4)
        c[0].metric("타자 행", len(pw.batting))
        c[1].metric("투수 행", len(pw.pitching))
        c[2].metric("오류", int(counts.get("error", 0)))
        c[3].metric("경고", int(counts.get("warning", 0)))
        if issues:
            frame = pd.DataFrame([i.as_dict() for i in issues])
            frame["수준"] = frame["수준"].map(LEVEL)
            show_info = st.toggle("참고 항목 보기", key=f"info_{pw.source}")
            if not show_info:
                frame = frame[frame["수준"] != LEVEL["info"]]
            st.dataframe(frame, hide_index=True, width="stretch", column_config=ISSUE_COLS,
                         height=min(38 + 35 * max(len(frame), 1), 420))

if cross:
    with st.container():
        st.subheader("파일 간 교차 검증")
        st.dataframe(pd.DataFrame([i.as_dict() for i in cross]).assign(수준=lambda d: d["수준"].map(LEVEL)),
                     hide_index=True, width="stretch", column_config=ISSUE_COLS)

# ── 저장 대상 선택 ───────────────────────────────────────────────────────────
targets = []
for pw, issues in parsed:
    s = pw.season_fallback
    if not s or not s.isdigit():
        continue
    if "scope" not in pw.batting.columns or "scope" not in pw.pitching.columns:
        continue  # 아는 시트가 하나도 없는 파일 (아래 '저장할 시즌 시트를 찾지 못했습니다'로 안내)
    season_sheets = {x["sheet"] for x in pw.sheets if x.get("type") == "summary" and x.get("season") == s and not x.get("term")}
    blocking = [i for i in issues if i.level == "error" and i.sheet in season_sheets]
    bat = pw.batting[pw.batting.scope == s]
    pit = pw.pitching[pw.pitching.scope == s]
    if bat.empty and pit.empty:
        continue
    targets.append({"season": s, "source": pw.source, "bat": bat, "pit": pit, "blocking": blocking})

if not targets:
    st.warning("저장할 시즌 시트를 찾지 못했습니다. 파일명에 연도(예: 2025)가 있고 같은 이름의 시트가 있어야 합니다.")
    st.stop()

st.header("저장 미리보기")
data = load_core()
current_bat, current_pit = data["bat"], data["pit"]
for t in targets:
    s = t["season"]
    with st.container():
        st.subheader(f"{s} 시즌 ← {t['source']}")
        old_b = current_bat[current_bat.season == s] if not current_bat.empty else pd.DataFrame()
        old_p = current_pit[current_pit.season == s] if not current_pit.empty else pd.DataFrame()
        db_ = diff(t["bat"], old_b, COMPARE_B)
        dp_ = diff(t["pit"], old_p, COMPARE_P)
        c = st.columns(3)
        c[0].metric("타자", len(t["bat"]), f"현재 {len(old_b)}명", delta_color="off")
        c[1].metric("투수", len(t["pit"]), f"현재 {len(old_p)}명", delta_color="off")
        c[2].metric("바뀌는 선수", len(db_) + len(dp_))
        shrink = [(lbl, r) for lbl, r in (("타석", shrink_report(t["bat"], old_b, "pa")),
                                            ("아웃카운트", shrink_report(t["pit"], old_p, "outs"))) if r]
        if shrink:
            st.warning("새 파일의 기록이 현재 DB보다 적습니다 — "
                       + ", ".join(f"팀 {lbl} {a} (현재 {b})" for lbl, (a, b) in shrink)
                       + ". 시즌 일부(예: 한 학기)만 들어 있는 파일이 아닌지 확인하세요.", icon=":material/trending_down:")
        renamed = int((db_["상태"] == "이름 다름").sum() + (dp_["상태"] == "이름 다름").sum())
        if renamed:
            st.info(f"'이름 다름' {renamed}건: 지난 기록이 현재 같은 배번 선수 이름으로 DB에 붙어 있습니다. "
                    "저장하면 기록지 이름으로 선수가 새로 만들어져 원래 주인에게 돌아갑니다.", icon=":material/badge:")
        if len(db_) + len(dp_):
            st.dataframe(pd.concat([db_.assign(구분="타자"), dp_.assign(구분="투수")])[["구분", "상태", "배번", "이름", "변경 내용"]],
                         hide_index=True, width="stretch")
        else:
            st.success("현재 DB와 동일합니다. 저장하지 않아도 됩니다.", icon=":material/check_circle:")

        if t["blocking"]:
            st.error(f"시즌 시트에 오류 {len(t['blocking'])}건 — 기록지를 고친 뒤 다시 올려 주세요.", icon=":material/block:")
            continue
        if repo.read_only:
            st.info("데모 모드에서는 저장할 수 없습니다.", icon=":material/lock:")
            continue
        ok = st.checkbox(f"{s} 시즌 요약 기록을 이 파일 내용으로 교체합니다. (경기별 기록은 유지)", key=f"confirm_{s}")
        if st.button(f"{s} 시즌 저장", type="primary", disabled=not ok, key=f"save_{s}"):
            res = repo.replace_season(s, t["bat"], t["pit"], actor(), t["source"])
            if res.ok:
                refresh()
                st.success(f"{res.message} — " + ", ".join(f"{k} {v}" for k, v in (res.counts or {}).items()))
            else:
                st.error(res.message)
