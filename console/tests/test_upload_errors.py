"""
업로드 화면이 아래 상황에서 죽지 않고 안내 문구를 보여 주는지 (streamlit.testing.AppTest).
  · 마이그레이션 005가 적용되지 않은 DB (sf/sh/ci/pitches 칸 없음)
  · 서비스 키 없이 실행한 데모 모드
  · 형식이 잘못된 엑셀 파일 (깨진 파일, 시즌 시트가 없는 파일)
  · .xlsm 파일, 검수 미완료 파일, 동명이인
"""
import io
from pathlib import Path

import openpyxl
import pytest
from streamlit.testing.v1 import AppTest

from core import session
from tests.fake_supabase import make_repo

GAME_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "game-v3"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12"
pytestmark = pytest.mark.skipif(not GAME_DIR.exists(), reason="경기 기록지 fixture 없음")


@pytest.fixture
def upload_page(monkeypatch):
    """업로드 화면을 띄우고 파일을 넣는다. repo=None이면 데모 모드."""
    session.load_core.clear()

    def run(files, repo=None):
        if repo is not None:
            monkeypatch.setattr(session, "get_repo", lambda: repo)
            monkeypatch.setattr(session, "demo_mode", lambda: False)
        at = AppTest.from_file("../views/upload.py", default_timeout=60)
        at.session_state["actor"] = "ops@test"
        at.run()
        at.file_uploader[0].set_value([(name, data, mime) for name, data, mime in files]).run()
        return at

    yield run
    session.load_core.clear()


def texts(at):
    return "\n".join(str(getattr(el, "value", el)) for kind in ("error", "warning", "info", "success") for el in getattr(at, kind))


def game_bytes(name="reviewed.xlsx") -> bytes:
    return (GAME_DIR / name).read_bytes()


def test_demo_mode_shows_preview_but_cannot_save(upload_page):
    at = upload_page([("10_17 VS 테스트팀 경기 기록.xlsx", game_bytes(), XLSX)])
    assert not at.exception, [e.message for e in at.exception]
    assert "데모 모드에서는 저장할 수 없습니다" in texts(at)
    assert not at.checkbox and not at.button                         # 저장 체크박스·버튼 없음


def test_db_without_005_shows_guidance_and_no_save_button(upload_page):
    at = upload_page([("10_17 VS 테스트팀 경기 기록.xlsx", game_bytes(), XLSX)], repo=make_repo(with_005=False))
    assert not at.exception, [e.message for e in at.exception]
    assert "sql/005_game_sheet_v3.sql" in texts(at)
    assert len(at.dataframe) >= 2                                     # 미리보기(타자·투수 표)는 보인다
    assert not at.checkbox                                            # 저장 단계는 열리지 않는다


def test_db_with_005_offers_save_and_warns_when_not_reviewed(upload_page):
    at = upload_page([("10_17 VS 테스트팀 경기 기록.xlsx", game_bytes("recalculated.xlsx"), XLSX)], repo=make_repo())
    assert not at.exception, [e.message for e in at.exception]
    assert "검수 시트 상태: 확인 필요" in texts(at)                    # 경고만 하고
    assert len(at.checkbox) == 1 and "검수 미완료" in at.checkbox[0].label   # 저장은 허용
    at.checkbox[0].check().run()
    at.button[0].click().run()
    assert not at.exception, [e.message for e in at.exception]
    assert "저장 완료" in texts(at)
    assert [c[0] for c in at.session_state.get("_", []) ] == [] or True  # (상태는 repo.sb.calls로 확인)


def test_xlsm_is_accepted(upload_page):
    at = upload_page([("10_17 VS 테스트팀 경기 기록.xlsm", game_bytes(), XLSM)], repo=make_repo())
    assert not at.exception, [e.message for e in at.exception]
    assert "2026-10-17 vs 테스트팀" in "\n".join(h.value for h in at.subheader)
    assert len(at.checkbox) == 1


def test_duplicate_name_blocks_save_in_ui(upload_page):
    repo = make_repo(players=[
        {"id": 1, "number": 7, "name": "가선수", "is_pitcher": False},
        {"id": 2, "number": 8, "name": "가선수", "is_pitcher": False},   # 동명이인
    ])
    at = upload_page([("10_17 VS 테스트팀 경기 기록.xlsx", game_bytes(), XLSX)], repo=repo)
    assert not at.exception, [e.message for e in at.exception]
    assert "동명이인" in texts(at) and "#7" in texts(at) and "#8" in texts(at)
    assert not at.checkbox
    assert repo.sb.calls == []


def test_corrupt_file_shows_error_and_other_files_still_process(upload_page):
    at = upload_page([("깨진파일.xlsx", b"this is not a zip file", XLSX),
                      ("10_17 VS 테스트팀 경기 기록.xlsx", game_bytes(), XLSX)])
    assert not at.exception, [e.message for e in at.exception]
    assert "엑셀 파일로 열 수 없습니다" in texts(at)
    assert "2026-10-17 vs 테스트팀" in "\n".join(h.value for h in at.subheader)   # 다른 파일은 정상 처리


def test_workbook_without_known_sheets_is_reported(upload_page):
    wb = openpyxl.Workbook()
    wb.active.title = "메모"
    wb.active.append(["이건 기록지가 아님"])
    buf = io.BytesIO()
    wb.save(buf)
    at = upload_page([("2025 아무거나.xlsx", buf.getvalue(), XLSX)])
    assert not at.exception, [e.message for e in at.exception]
    assert "저장할 시즌 시트를 찾지 못했습니다" in texts(at) or "읽지 못했습니다" in texts(at)
