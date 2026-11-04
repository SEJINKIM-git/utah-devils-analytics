"""모든 화면이 데모 모드(가짜 기록지, tests/synthetic.py)에서 예외 없이 렌더링되는지 확인."""
import pytest
from streamlit.testing.v1 import AppTest

PAGES = ["views/dashboard.py", "views/records.py", "views/player.py", "views/compare.py",
         "views/situations.py", "views/ai_report.py", "views/upload.py", "views/manage.py"]


@pytest.mark.parametrize("page", PAGES)
@pytest.mark.parametrize("season", ["2099", "Career"])
def test_page_renders(page, season):
    at = AppTest.from_file("../" + page, default_timeout=60)
    at.session_state["season_global"] = season
    at.run()
    assert not at.exception, [e.message for e in at.exception]


def test_app_shell():
    at = AppTest.from_file("../app.py", default_timeout=60)
    at.run()
    assert not at.exception, [e.message for e in at.exception]


def test_player_detail_with_selection():
    at = AppTest.from_file("../views/player.py", default_timeout=60)
    at.run()
    at.selectbox[-1].set_value(at.selectbox[-1].options and 1).run()  # 첫 선수(id 1)
    assert not at.exception, [e.message for e in at.exception]
    assert len(at.dataframe) >= 1


def test_compare_two_players():
    at = AppTest.from_file("../views/compare.py", default_timeout=60)
    at.session_state["season_global"] = "2099"
    at.run()
    from core import aggregate as agg
    from core.db import LocalRepo

    repo = LocalRepo()
    bat = agg.season_batting(repo.batting_raw(), repo.players())
    ids = bat[bat.season == "2099"].nlargest(2, "pa")["player_id"].tolist()
    at.multiselect[0].set_value(ids).run()
    assert not at.exception, [e.message for e in at.exception]
    assert len(at.get("plotly_chart")) == 1


def test_dashboard_team_numbers():
    from tests.synthetic import BATTING

    games = [g for gs in BATTING.values() for g in gs]
    hits, ab = sum(g[4] for g in games), sum(g[2] for g in games)
    at = AppTest.from_file("../views/dashboard.py", default_timeout=60)
    at.session_state["season_global"] = "2099"
    at.run()
    metrics = {m.label: m.value for m in at.metric}
    assert metrics["팀 타율"] == f"{hits / ab:.3f}".lstrip("0")
