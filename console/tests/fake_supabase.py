"""
supabase-py 클라이언트 흉내 — 콘솔 쓰기 경로 테스트용 (운영 DB에 붙지 않는다).

  · table(name).select(...).eq(...).range(...).limit(...).order(...).execute().data → 미리 넣어 둔 행
  · select("sf")처럼 없는 컬럼을 고르면 PostgREST처럼 APIError
  · rpc(name, params).execute().data → 등록된 함수 결과. 없는 함수면 PGRST202 APIError
"""
from __future__ import annotations

from dataclasses import dataclass, field


class APIError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class _Result:
    data: object


class _Query:
    def __init__(self, repo: "FakeSupabase", table: str, select: str):
        self.repo, self.table, self.select = repo, table, select
        self.filters: list[tuple[str, object]] = []
        self.rng: tuple[int, int] | None = None
        self.lim: int | None = None

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def gte(self, k, v):
        self.filters.append((k, v))
        return self

    def order(self, *a, **k):
        return self

    def range(self, a, b):
        self.rng = (a, b)
        return self

    def limit(self, n):
        self.lim = n
        return self

    def execute(self):
        rows = list(self.repo.tables.get(self.table, []))
        cols = [c.strip() for c in self.select.split(",")] if self.select != "*" else []
        for c in cols:
            if c and rows and c not in rows[0]:
                raise APIError("42703", f"column {self.table}.{c} does not exist")
            if c and not rows and c in self.repo.missing_columns.get(self.table, set()):
                raise APIError("42703", f"column {self.table}.{c} does not exist")
        for k, v in self.filters:
            rows = [r for r in rows if r.get(k) == v]
        if self.rng:
            rows = rows[self.rng[0]: self.rng[1] + 1]
        if self.lim is not None:
            rows = rows[: self.lim]
        return _Result(rows)


class _Rpc:
    def __init__(self, repo: "FakeSupabase", name: str, params: dict):
        self.repo, self.name, self.params = repo, name, params

    def execute(self):
        if self.name not in self.repo.functions:
            raise APIError("PGRST202", f"Could not find the function public.{self.name} in the schema cache")
        self.repo.calls.append((self.name, self.params))
        fn = self.repo.functions[self.name]
        return _Result(fn(self.params) if callable(fn) else fn)


@dataclass
class FakeSupabase:
    tables: dict[str, list[dict]] = field(default_factory=dict)
    functions: dict = field(default_factory=dict)
    missing_columns: dict[str, set[str]] = field(default_factory=dict)
    calls: list[tuple[str, dict]] = field(default_factory=list)

    def table(self, name):
        return _TableRef(self, name)

    def rpc(self, name, params):
        return _Rpc(self, name, params)


class _TableRef:
    def __init__(self, repo, name):
        self.repo, self.name = repo, name

    def select(self, select="*"):
        return _Query(self.repo, self.name, select)

    # 직접 쓰기는 콘솔이 쓰면 안 된다 — 호출되면 테스트가 실패하도록 둔다
    def insert(self, *a, **k):
        raise AssertionError(f"콘솔이 {self.name}에 직접 insert 했습니다 — DB 함수를 써야 합니다")

    def update(self, *a, **k):
        raise AssertionError(f"콘솔이 {self.name}에 직접 update 했습니다 — DB 함수를 써야 합니다")

    def delete(self, *a, **k):
        raise AssertionError(f"콘솔이 {self.name}에 직접 delete 했습니다 — DB 함수를 써야 합니다")


PLAYERS = [
    {"id": 1, "number": 7, "name": "가선수", "is_pitcher": False},
    {"id": 2, "number": 11, "name": "나선수", "is_pitcher": True},
    {"id": 3, "number": 23, "name": "다선수", "is_pitcher": False},
    {"id": 40, "number": 72, "name": "홍길동", "is_pitcher": False},   # 동명이인
    {"id": 41, "number": 74, "name": "홍길동", "is_pitcher": False},
]


def make_repo(*, with_005=True, with_006=True, players=PLAYERS):
    """SupabaseRepo를 가짜 클라이언트로 — create_client를 거치지 않는다."""
    from core.db import SupabaseRepo

    sb = FakeSupabase(tables={
        "players": [dict(p) for p in players],
        "batting_stats": [], "pitching_stats": [], "games": [], "ai_reports": [], "console_audit_log": [],
    })
    if not with_005:
        sb.missing_columns["batting_stats"] = {"sf", "sh", "ci"}
    sb.functions["console_replace_season"] = lambda p: {
        "batting": len(p["p_batting"]), "pitching": len(p["p_pitching"]), "before_batting": 0, "before_pitching": 0,
        "new_players": len({(r.get("number"), r["name"]) for r in p["p_batting"] + p["p_pitching"] if "name" in r}),
    }
    if with_005:
        sb.functions["console_replace_game"] = lambda p: {
            "game_id": 99, "created": True, "batting": len(p["p_batting"]), "pitching": len(p["p_pitching"]),
            "before_batting": 0, "before_pitching": 0,
            "new_players": len({r["name"] for r in p["p_batting"] + p["p_pitching"] if "name" in r}),
        }
    if with_006:
        sb.functions["console_update_rows"] = lambda p: len(p["p_changes"])
        sb.functions["console_log_situation"] = lambda p: {"situation_id": "s1", "decision_id": "d1", "li": 1.4, "lc": "high"}
        sb.functions["console_save_ai_report"] = lambda p: 5
    repo = SupabaseRepo.__new__(SupabaseRepo)
    repo.sb = sb
    return repo
