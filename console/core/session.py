"""Streamlit 공통: 저장소 선택, 로그인, 캐시된 데이터 로딩, 시즌 선택."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from . import aggregate as agg
from .db import BaseRepo, LocalRepo, SupabaseRepo


def _secret(path: str, default=None):
    try:
        node = st.secrets
        for part in path.split("."):
            node = node[part]
        return node
    except Exception:
        return default


def demo_mode() -> bool:
    return not (_secret("supabase.url") and _secret("supabase.service_role_key"))


@st.cache_resource
def get_repo() -> BaseRepo:
    if demo_mode():
        repo = LocalRepo()
        if repo.players().empty:
            # 실제 기록지가 없으면(공개 저장소 클론) 가짜 기록지로 화면을 보여준다
            import tempfile
            from pathlib import Path

            from tests.synthetic import build_all

            folder = Path(tempfile.mkdtemp(prefix="devils-demo-"))
            build_all(folder)
            repo = LocalRepo(folder)
            repo.label = "데모 (가짜 기록지, 읽기 전용)"
        return repo
    return SupabaseRepo(_secret("supabase.url"), _secret("supabase.service_role_key"))


# ── 로그인 ───────────────────────────────────────────────────────────────────
def require_login():
    """운영 모드: Supabase Auth 이메일 로그인 + 홈페이지 admin_members 승인 여부 확인."""
    if demo_mode():
        st.session_state.setdefault("actor", "demo")
        return
    if st.session_state.get("actor"):
        return

    st.title("Devils Console")
    st.caption("운영진 전용 데이터·분석 콘솔")
    with st.form("login"):
        email = st.text_input("이메일")
        pw = st.text_input("비밀번호", type="password")
        ok = st.form_submit_button("로그인", type="primary")
    if ok:
        from supabase import create_client

        try:
            auth = create_client(_secret("supabase.url"), _secret("supabase.anon_key")).auth
            user = auth.sign_in_with_password({"email": email, "password": pw}).user
        except Exception:
            st.error("이메일 또는 비밀번호가 올바르지 않습니다.")
            st.stop()
        repo: SupabaseRepo = get_repo()  # type: ignore[assignment]
        member = repo.sb.table("admin_members").select("role,approved_at,display_name").eq("user_id", user.id).execute().data
        if not member or not member[0].get("approved_at"):
            st.error("승인된 운영진 계정이 아닙니다. 홈페이지 /admin에서 승인을 요청하세요.")
            st.stop()
        st.session_state["actor"] = user.email
        st.session_state["role"] = member[0].get("role")
        st.rerun()
    st.stop()


def actor() -> str:
    return st.session_state.get("actor", "unknown")


# ── 데이터 (캐시) ────────────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner="기록 불러오는 중…")
def load_core():
    repo = get_repo()
    players = repo.players()
    bat_raw, pit_raw, games = repo.batting_raw(), repo.pitching_raw(), repo.games()
    bat = agg.season_batting(bat_raw, players)
    pit, ip_warnings = agg.season_pitching(pit_raw, players)
    health = agg.data_health(players, bat_raw, pit_raw, games)
    return {"players": players, "bat_raw": bat_raw, "pit_raw": pit_raw, "games": games,
            "bat": bat, "pit": pit, "ip_warnings": ip_warnings, "health": health}


def refresh():
    load_core.clear()


def seasons(data) -> list[str]:
    vals = set(data["bat"].get("season", pd.Series(dtype=str))) | set(data["pit"].get("season", pd.Series(dtype=str)))
    return sorted(vals, reverse=True) + ["Career"]


def season_frames(data, season: str):
    """선택 시즌의 타자·투수 집계. Career는 시즌 합."""
    if season == "Career":
        return agg.career(data["bat"], "batting"), agg.career(data["pit"], "pitching")
    bat, pit = data["bat"], data["pit"]
    return (bat[bat.season == season] if not bat.empty else bat), (pit[pit.season == season] if not pit.empty else pit)


def season_picker(data, key="season"):
    opts = seasons(data)
    default = st.session_state.get("season_global", opts[0] if opts else "Career")
    idx = opts.index(default) if default in opts else 0
    choice = st.sidebar.selectbox("시즌", opts, index=idx, key=key)
    st.session_state["season_global"] = choice
    return choice
