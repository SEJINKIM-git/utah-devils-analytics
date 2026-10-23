import os
from pathlib import Path

import pytest

from tests.synthetic import build_all

REAL_FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def synthetic_dir(tmp_path_factory) -> Path:
    folder = tmp_path_factory.mktemp("synthetic")
    build_all(folder)
    return folder


@pytest.fixture(autouse=True)
def demo_data(synthetic_dir, monkeypatch):
    """화면 테스트는 데모 모드(가짜 기록지)로 실행한다."""
    monkeypatch.setenv("DEVILS_FIXTURES", str(synthetic_dir))
    yield


def has_real_fixtures() -> bool:
    return any(REAL_FIXTURES.glob("20*_Utah_Devils_Player_Stat.xlsx"))


real_data = pytest.mark.skipif(
    not has_real_fixtures() and not os.environ.get("REQUIRE_REAL_FIXTURES"),
    reason="실제 기록지가 tests/fixtures/에 없음 (공개 저장소라 커밋하지 않음)",
)
