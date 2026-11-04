"""업로드 미리보기: 새 파일 vs 현재 DB (선수·시즌 단위)."""
from __future__ import annotations

import pandas as pd

from .aggregate import identity_key

COMPARE_B = ["pa", "ab", "hits", "hr", "rbi", "bb", "so", "sb"]
COMPARE_P = ["outs", "er", "ha", "bb", "so"]
COLUMNS = ["상태", "배번", "이름", "변경 내용"]


def _keyed(df: pd.DataFrame, cols) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=["number", "name", *cols])
    out = df.assign(key=[identity_key(a, b) for a, b in zip(df.number, df.name)])
    return out.drop_duplicates("key").set_index("key")


def diff(new: pd.DataFrame, old: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """상태: 신규 / 삭제 / 변경 / 이름 다름.

    '이름 다름' = 같은 배번·같은 기록인데 이름만 다른 경우. 기존 업로더가 배번으로 선수를 찾아
    이름을 덮어써서, 지난 시즌 기록이 지금 그 배번을 단 선수 이름으로 붙어 있는 상태를 뜻한다.
    """
    n, o = _keyed(new, cols), _keyed(old, cols)
    rows = []
    only_new = [k for k in n.index if k not in o.index]
    only_old = [k for k in o.index if k not in n.index]

    # 이름 다름 짝짓기
    paired_new, paired_old = set(), set()
    for kn in only_new:
        a = n.loc[kn]
        for ko in only_old:
            if ko in paired_old:
                continue
            b = o.loc[ko]
            if int(a["number"]) == int(b["number"]) and all(int(a.get(c, 0)) == int(b.get(c, 0)) for c in cols):
                rows.append({"상태": "이름 다름", "배번": int(a["number"]), "이름": a["name"],
                             "변경 내용": f"DB에는 '{b['name']}' 이름으로 저장됨 (기록 동일)"})
                paired_new.add(kn)
                paired_old.add(ko)
                break

    for k in only_new:
        if k not in paired_new:
            a = n.loc[k]
            rows.append({"상태": "신규", "배번": int(a["number"]), "이름": a["name"], "변경 내용": ""})
    for k in only_old:
        if k not in paired_old:
            b = o.loc[k]
            rows.append({"상태": "삭제", "배번": int(b["number"]), "이름": b["name"], "변경 내용": "새 파일에 없음 — 저장하면 이 시즌 기록이 사라짐"})
    for k in n.index.intersection(o.index):
        a, b = n.loc[k], o.loc[k]
        ch = [f"{c} {int(b.get(c, 0))}→{int(a.get(c, 0))}" for c in cols if int(b.get(c, 0)) != int(a.get(c, 0))]
        if ch:
            rows.append({"상태": "변경", "배번": int(a["number"]), "이름": a["name"], "변경 내용": ", ".join(ch)})

    order = {"삭제": 0, "변경": 1, "이름 다름": 2, "신규": 3}
    out = pd.DataFrame(rows, columns=COLUMNS)
    return out.sort_values(["상태", "배번"], key=lambda s: s.map(order) if s.name == "상태" else s).reset_index(drop=True)


def shrink_report(new: pd.DataFrame, old: pd.DataFrame, col: str) -> tuple[int, int] | None:
    """새 파일의 팀 합계가 DB보다 작으면 (새, 기존)을 돌려준다. 시즌 일부만 담긴 파일을 올리는 사고 방지."""
    if old is None or old.empty or new.empty:
        return None
    a, b = int(new[col].sum()), int(old[col].sum())
    return (a, b) if a < b else None
