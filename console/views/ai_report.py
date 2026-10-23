"""AI 시즌 리포트. 지표는 core.stats로 계산한 값만 넘기고, 모델은 해석만 한다."""
import json

import pandas as pd
import streamlit as st

from core import aggregate as agg
from core.session import _secret, actor, get_repo, load_core, season_frames, season_picker
from core.stats import ERA_BASE_INNINGS
from core.ui import empty_state, rate

repo = get_repo()
data = load_core()
season = season_picker(data)
bat, pit = season_frames(data, season)
st.title("AI 리포트")

if bat.empty and pit.empty:
    empty_state("기록이 없는 시즌은 리포트를 만들지 않습니다. (빈 시즌에 지난 리포트가 보이던 문제 방지)")
    st.stop()


def build_context() -> dict:
    tb, tp = agg.team_totals(bat, "batting"), agg.team_totals(pit, "pitching")
    b = bat[bat.pa >= 5].sort_values("ops", ascending=False)
    p = pit[pit.outs >= 6].sort_values("era")
    return {
        "season": season,
        "rules": f"아마추어 대학 클럽. ERA는 {ERA_BASE_INNINGS}이닝 기준. 출루율 분모는 타석.",
        "team": {"타율": rate(tb.get("avg")), "출루율": rate(tb.get("obp")), "OPS": rate(tb.get("ops")),
                 "도루": int(tb.get("sb", 0)), "ERA": rate(tp.get("era"), 2), "WHIP": rate(tp.get("whip"), 2),
                 "볼넷": int(tp.get("bb", 0)), "탈삼진": int(tp.get("so", 0))},
        "batters": [{"이름": r.name, "타석": int(r.pa), "타율": rate(r.avg), "출루율": rate(r.obp), "OPS": rate(r.ops),
                     "도루": int(r.sb), "삼진": int(r.so)} for r in b.itertuples()],
        "pitchers": [{"이름": r.name, "이닝": r.ip, "ERA": rate(r.era, 2), "WHIP": rate(r.whip, 2),
                      "볼넷": int(r.bb), "삼진": int(r.so)} for r in p.itertuples()],
    }


ctx = build_context()
with st.expander("모델에 전달되는 데이터", icon=":material/data_object:"):
    st.json(ctx)

SYSTEM = (
    "당신은 대학 야구 클럽의 데이터 분석가다. 주어진 수치만 근거로 쓰고, 없는 수치를 만들지 마라. "
    "표본이 작은 선수(타석 20 미만, 10이닝 미만)는 단정하지 말고 표본이 작다고 밝혀라. "
    'JSON으로만 답한다: {"summary": str, "strengths": [str], "improvements": [str], "actions": [str]}'
)

key = _secret("openai.api_key")
if not key:
    st.info("secrets에 openai.api_key가 없어 생성할 수 없습니다.", icon=":material/key_off:")
elif st.button("리포트 생성", type="primary", icon=":material/auto_awesome:"):
    from openai import OpenAI

    with st.spinner("분석 중…"):
        res = OpenAI(api_key=key).chat.completions.create(
            model=_secret("openai.model", "gpt-4o"),
            response_format={"type": "json_object"},
            temperature=0.3,
            messages=[{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": json.dumps(ctx, ensure_ascii=False)}],
        )
        st.session_state[f"report_{season}"] = json.loads(res.choices[0].message.content)

report = st.session_state.get(f"report_{season}")
if report:
    st.subheader("요약")
    st.write(report.get("summary", ""))
    a, b = st.columns(2, gap="large")
    a.markdown("**강점**\n" + "\n".join(f"- {x}" for x in report.get("strengths", [])))
    b.markdown("**개선점**\n" + "\n".join(f"- {x}" for x in report.get("improvements", [])))
    st.markdown("**실행 항목**\n" + "\n".join(f"1. {x}" for x in report.get("actions", [])))
    if st.button("저장", disabled=repo.read_only, help="ai_reports에 시즌과 함께 저장"):
        # 분석 플랫폼 대시보드가 읽는 형식(JSON)과 맞춘다 (lib/teamReports.ts, app/page.tsx)
        r = repo.save_ai_report({"report_type": "team", "season": season, "summary": report.get("summary"),
                                 "strengths": json.dumps({"team_strengths": report.get("strengths", [])}, ensure_ascii=False),
                                 "improvements": json.dumps({"team_weaknesses": report.get("improvements", []),
                                                             "strategic_recommendations": report.get("actions", [])},
                                                            ensure_ascii=False),
                                 "training_plan": "\n".join(report.get("actions", []))}, actor())
        (st.success if r.ok else st.error)(r.message)

saved = repo.ai_reports()
if not saved.empty and "season" in saved:
    saved = saved[(saved["report_type"] == "team") & (saved["season"] == season)]
    if not saved.empty:
        st.subheader("저장된 리포트")
        for r in saved.sort_values("generated_at", ascending=False).head(3).itertuples():
            with st.expander(str(pd.to_datetime(r.generated_at).date()) if r.generated_at else "날짜 없음"):
                st.write(r.summary)
