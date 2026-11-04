import pandas as pd

from core.diffing import diff, shrink_report

COLS = ["pa", "hits"]


def frame(rows):
    return pd.DataFrame(rows, columns=["number", "name", *COLS])


def test_name_mismatch_paired_not_reported_as_add_delete():
    # 2022 #52 기록이 DB에서는 현재 #52(선수B) 이름으로 붙어 있는 실제 사례
    new = frame([(52, "선수A", 31, 13)])
    old = frame([(52, "선수B", 31, 13)])
    d = diff(new, old, COLS)
    assert d["상태"].tolist() == ["이름 다름"]
    assert "선수B" in d.iloc[0]["변경 내용"]


def test_change_add_delete():
    new = frame([(1, "가", 10, 3), (3, "다", 5, 1)])
    old = frame([(1, "가", 8, 3), (2, "나", 4, 0)])
    d = diff(new, old, COLS).set_index("이름")["상태"].to_dict()
    assert d == {"가": "변경", "나": "삭제", "다": "신규"}


def test_identical_is_empty():
    f = frame([(1, "가", 10, 3)])
    assert diff(f, f, COLS).empty


def test_whitespace_in_name_is_same_player():
    assert diff(frame([(7, "선수 G", 1, 0)]), frame([(7, "선수G", 1, 0)]), COLS).empty


def test_shrink_guard():
    assert shrink_report(frame([(1, "가", 10, 3)]), frame([(1, "가", 25, 3)]), "pa") == (10, 25)
    assert shrink_report(frame([(1, "가", 30, 3)]), frame([(1, "가", 25, 3)]), "pa") is None
