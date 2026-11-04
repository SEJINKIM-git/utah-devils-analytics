"""데이터 수정(변경분만 저장 + 감사 로그)과 구조 점검."""
import pandas as pd
import streamlit as st

from core.session import actor, get_repo, load_core, refresh, season_picker
from core.stats import InvalidInningsError, ip_to_outs

repo = get_repo()
data = load_core()
season = season_picker(data)
st.title("데이터 수정·점검")

tab_edit, tab_health, tab_log = st.tabs(["기록 수정", "데이터 점검", "변경 이력"])

TABLES = {
    "타자 기록": ("batting_stats", "bat_raw", ["pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"]),
    "투수 기록": ("pitching_stats", "pit_raw", ["w", "l", "sv", "hld", "ip", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed"]),
    "선수": ("players", "players", ["number", "name", "is_pitcher"]),
}

def editor():
    which = st.segmented_control("대상", list(TABLES), default="타자 기록")
    table, key, cols = TABLES[which]
    raw = data[key].copy()
    if raw.empty:
        st.info("데이터가 없습니다.")
        return
    if table != "players":
        if season == "Career":
            st.info("통산은 계산값이라 수정할 수 없습니다. 시즌을 선택하세요.")
            return
        raw = raw[raw["season"].astype(str) == season]
        only_summary = st.toggle("시즌 요약 행만 (경기별 행 제외)", value=True)
        if only_summary and "game_id" in raw:
            raw = raw[raw["game_id"].isna()]
        names = data["players"].set_index("id")
        raw = raw.assign(선수=raw["player_id"].map(lambda i: f"{names.at[i, 'number']}. {names.at[i, 'name']}" if i in names.index else "?"))
        view_cols = ["id", "선수", *cols]
    else:
        view_cols = ["id", *cols]
    base = raw[view_cols].sort_values(view_cols[1]).reset_index(drop=True)

    st.caption("셀을 고친 뒤 '변경 저장'을 누르면 바뀐 셀만 저장되고, 전/후 값이 변경 이력에 남습니다. 행 추가·삭제는 업로드로만 합니다.")
    edited = st.data_editor(
        base, hide_index=True, width="stretch", num_rows="fixed", key=f"editor_{table}_{season}",
        disabled=["id", "선수"],
        column_config={"ip": st.column_config.NumberColumn("ip", help="야구식 표기 (3.1 = 3⅓이닝)", format="%.1f")},
    )

    changes = []
    for i in range(len(base)):
        before = {c: base.at[i, c] for c in cols if c in base}
        after = {c: edited.at[i, c] for c in cols if c in edited}
        delta = {c: after[c] for c in cols if c in before and str(before[c]) != str(after[c])}
        if delta:
            changes.append({"id": int(base.at[i, "id"]), "before": {c: before[c] for c in delta}, "after": delta})

    # 저장 전 검증
    problems = []
    for ch in changes:
        a = ch["after"]
        if "ip" in a:
            try:
                ip_to_outs(a["ip"])
            except InvalidInningsError as e:
                problems.append(f"id {ch['id']}: {e}")
        merged = {**{c: base.loc[base.id == ch["id"], c].iloc[0] for c in cols if c in base}, **a}
        if table == "batting_stats" and merged["hits"] > merged["ab"]:
            problems.append(f"id {ch['id']}: 안타({merged['hits']})가 타수({merged['ab']})보다 많음")
        if table == "batting_stats" and merged["ab"] > merged["pa"]:
            problems.append(f"id {ch['id']}: 타수가 타석보다 많음")
        if table == "batting_stats" and merged["doubles"] + merged["triples"] + merged["hr"] > merged["hits"]:
            problems.append(f"id {ch['id']}: 장타 합이 안타보다 많음")
        if any(isinstance(v, (int, float)) and v < 0 for v in a.values()):
            problems.append(f"id {ch['id']}: 음수 값")

    if changes:
        st.dataframe(pd.DataFrame([{"id": c["id"], "변경": ", ".join(f"{k}: {c['before'][k]} → {v}" for k, v in c["after"].items())}
                                   for c in changes]), hide_index=True, width="stretch")
    for p in problems:
        st.error(p)
    note = st.text_input("수정 사유 (변경 이력에 기록)", placeholder="예: 4/12 경기 기록지 재확인, 도루 1 누락")
    if st.button(f"변경 저장 ({len(changes)}행)", type="primary",
                 disabled=not changes or bool(problems) or repo.read_only or not note.strip()):
        for c in changes:
            c["note"] = note.strip()
        res = repo.update_rows(table, changes, actor())
        if res.ok:
            refresh()
            st.success(res.message)
            st.rerun()
        else:
            st.error(res.message)
    if repo.read_only:
        st.caption("데모 모드에서는 저장할 수 없습니다.")


with tab_edit:
    editor()

with tab_health:
    st.caption("숫자가 화면마다 다르게 나오는 구조적 원인들입니다. 콘솔 집계는 이 문제들을 피해 계산하지만, 홈페이지·기존 플랫폼은 영향을 받습니다.")
    h = data["health"]
    if h.empty:
        st.success("발견된 문제가 없습니다.")
    else:
        st.dataframe(h, hide_index=True, width="stretch")
    if data["ip_warnings"]:
        with st.expander(f"이닝 표기 오류 {len(data['ip_warnings'])}건"):
            st.write(sorted(set(data["ip_warnings"])))

with tab_log:
    log = repo.audit_log()
    if log.empty:
        st.info("변경 이력이 없거나 감사 로그 테이블이 아직 없습니다 (저장소 sql/001_audit_log_and_report_season.sql).")
    else:
        st.dataframe(log[["created_at", "actor", "action", "table_name", "note"]], hide_index=True, width="stretch",
                     column_config={"created_at": "시각", "actor": "작업자", "action": "작업", "table_name": "테이블", "note": "메모"})
        pick = st.selectbox("상세 보기", log["id"].tolist(), format_func=lambda i: f"#{i}", index=None)
        if pick is not None:
            r = log[log.id == pick].iloc[0]
            a, b = st.columns(2)
            a.markdown("**변경 전**")
            a.json(r["before"] or {})
            b.markdown("**변경 후**")
            b.json(r["after"] or {})
