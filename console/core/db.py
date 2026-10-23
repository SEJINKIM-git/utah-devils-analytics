"""
데이터 접근 계층.

  · SupabaseRepo : 운영 DB (홈페이지·기존 플랫폼과 같은 프로젝트)
  · LocalRepo    : secrets가 없을 때 tests/fixtures의 엑셀로 띄우는 읽기 전용 데모

모든 쓰기는 이 파일을 거치고, 쓰기마다 console_audit_log에 전/후 값을 남긴다.
홈페이지가 읽는 테이블 구조(ip를 야구식 표기로 저장 등)는 바꾸지 않는다.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .parser import parse_workbook
from .stats import outs_to_ip

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
AUDIT_TABLE = "console_audit_log"


@dataclass
class WriteResult:
    ok: bool
    message: str
    counts: dict | None = None


class BaseRepo:
    read_only = True
    label = ""

    # 읽기
    def players(self) -> pd.DataFrame: ...
    def batting_raw(self) -> pd.DataFrame: ...
    def pitching_raw(self) -> pd.DataFrame: ...
    def games(self) -> pd.DataFrame: ...
    def situations(self, season: str | None = None) -> pd.DataFrame: return pd.DataFrame()
    def ai_reports(self) -> pd.DataFrame: return pd.DataFrame()
    def audit_log(self, limit=200) -> pd.DataFrame: return pd.DataFrame()

    # 쓰기 (LocalRepo는 거부)
    def replace_season(self, season, batting, pitching, actor, source) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def update_rows(self, table, changes: list[dict], actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def log_situation(self, situation: dict, decision: dict | None, actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def save_ai_report(self, report: dict, actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")


# ── 로컬 데모 ────────────────────────────────────────────────────────────────
class LocalRepo(BaseRepo):
    label = "데모 (엑셀 기록지, 읽기 전용)"

    def __init__(self, folder: Path | None = None):
        folder = Path(folder or os.environ.get("DEVILS_FIXTURES") or FIXTURES)
        files = sorted(p for p in folder.glob("*_Utah_Devils_Player_Stat.xlsx") if p.name[:4].isdigit())
        if not files:
            self._players = pd.DataFrame(columns=["id", "number", "name", "is_pitcher"])
            self._bat = pd.DataFrame(columns=["id", "player_id", "season", "game_id"])
            self._pit = pd.DataFrame(columns=["id", "player_id", "season", "game_id", "ip"])
            return
        bat, pit = [], []
        for f in files:
            pw = parse_workbook(f)
            season = pw.season_fallback
            bat.append(pw.batting[pw.batting.scope == season])
            pit.append(pw.pitching[pw.pitching.scope == season])
        b, p = pd.concat(bat), pd.concat(pit)
        ids = pd.concat([b[["number", "name"]], p[["number", "name"]]]).drop_duplicates().reset_index(drop=True)
        ids["id"] = ids.index + 1
        ids["is_pitcher"] = ids.set_index(["number", "name"]).index.isin(p.set_index(["number", "name"]).index)
        self._players = ids[["id", "number", "name", "is_pitcher"]]
        key = ids.set_index(["number", "name"])["id"]
        self._bat = b.assign(player_id=key.loc[list(zip(b.number, b.name))].values, season=b.scope, game_id=None).reset_index(drop=True)
        self._bat["id"] = self._bat.index + 1
        p = p.assign(player_id=key.loc[list(zip(p.number, p.name))].values, season=p.scope, game_id=None)
        p["ip"] = p["outs"].map(lambda o: float(outs_to_ip(o)))
        self._pit = p.reset_index(drop=True)
        self._pit["id"] = self._pit.index + 1

    def players(self):
        return self._players

    def batting_raw(self):
        return self._bat

    def pitching_raw(self):
        return self._pit

    def games(self):
        return pd.DataFrame(columns=["id", "date", "opponent", "season", "result", "score_us", "score_them"])


# ── Supabase ────────────────────────────────────────────────────────────────
class SupabaseRepo(BaseRepo):
    read_only = False
    label = "운영 DB (Supabase)"

    def __init__(self, url: str, service_key: str):
        from supabase import create_client

        self.sb = create_client(url, service_key)

    # 읽기 ───────────────────────────────────────────────────────────────────
    def _all(self, table, select="*", **eq) -> pd.DataFrame:
        rows, start, page = [], 0, 1000
        while True:
            q = self.sb.table(table).select(select)
            for k, v in eq.items():
                q = q.eq(k, v)
            data = q.range(start, start + page - 1).execute().data
            rows += data
            if len(data) < page:
                break
            start += page
        return pd.DataFrame(rows)

    def players(self):
        return self._all("players", "id,number,name,is_pitcher")

    def batting_raw(self):
        return self._all("batting_stats")

    def pitching_raw(self):
        return self._all("pitching_stats")

    def games(self):
        return self._all("games")

    def situations(self, season=None):
        return self._all("v_situation_decisions", **({"season": season} if season else {}))

    def ai_reports(self):
        return self._all("ai_reports")

    def audit_log(self, limit=200):
        try:
            data = self.sb.table(AUDIT_TABLE).select("*").order("created_at", desc=True).limit(limit).execute().data
            return pd.DataFrame(data)
        except Exception:
            return pd.DataFrame()

    # 감사 로그 ─────────────────────────────────────────────────────────────
    def _audit(self, actor, action, table, before, after, note=None):
        self.sb.table(AUDIT_TABLE).insert({
            "actor": actor, "action": action, "table_name": table,
            "before": json.loads(json.dumps(before, default=str)) if before is not None else None,
            "after": json.loads(json.dumps(after, default=str)) if after is not None else None,
            "note": note,
        }).execute()

    def audit_ready(self) -> bool:
        try:
            self.sb.table(AUDIT_TABLE).select("id").limit(1).execute()
            return True
        except Exception:
            return False

    # 선수 매칭 ──────────────────────────────────────────────────────────────
    def _player_id(self, number, name, is_pitcher, cache):
        from .aggregate import identity_key

        key = identity_key(number, name)
        if key in cache:
            pid = cache[key]
            if is_pitcher:
                self.sb.table("players").update({"is_pitcher": True}).eq("id", pid).execute()
            return pid, False
        row = self.sb.table("players").insert({"number": int(number), "name": name, "is_pitcher": bool(is_pitcher)}).execute().data[0]
        cache[key] = row["id"]
        return row["id"], True

    # 시즌 교체 업로드 ───────────────────────────────────────────────────────
    def replace_season(self, season, batting, pitching, actor, source):
        """기존 업로드와 같은 의미(해당 시즌 요약 행 교체) + 멱등성 + 감사 로그.
        경기별 행(game_id 있음)은 건드리지 않는다. 같은 파일을 두 번 올려도 결과가 같다."""
        from .aggregate import canonical_players

        if not self.audit_ready():
            return WriteResult(False, f"감사 로그 테이블({AUDIT_TABLE})이 없습니다. 저장소의 sql/001_audit_log_and_report_season.sql을 먼저 적용하세요.")
        players = self.players()
        cp = canonical_players(players)
        cache = dict(zip(cp["identity"], cp["canonical_id"]))

        new_players = 0
        bat_rows, pit_rows = [], []
        for r in batting.itertuples():
            pid, created = self._player_id(r.number, r.name, False, cache)
            new_players += created
            bat_rows.append({"player_id": pid, "season": season, "pa": r.pa, "ab": r.ab, "runs": r.runs, "hits": r.hits,
                             "doubles": r.doubles, "triples": r.triples, "hr": r.hr, "rbi": r.rbi, "bb": r.bb,
                             "hbp": r.hbp, "so": r.so, "sb": r.sb})
        for r in pitching.itertuples():
            pid, created = self._player_id(r.number, r.name, True, cache)
            new_players += created
            # 홈페이지 호환: ip는 기존처럼 야구식 표기 숫자로 저장 (46.2)
            pit_rows.append({"player_id": pid, "season": season, "w": r.w, "l": r.l, "sv": r.sv, "hld": r.hld,
                             "ip": float(outs_to_ip(r.outs)), "ha": r.ha, "runs_allowed": r.runs_allowed, "er": r.er,
                             "bb": r.bb, "hbp": r.hbp, "so": r.so, "hr_allowed": r.hr_allowed})

        # 삭제·삽입·감사 로그를 DB 함수 하나로 처리 → 중간 실패 시 전체 롤백
        to_py = lambda rows: json.loads(json.dumps(rows, default=int))  # numpy int → int  # noqa: E731
        res = self.sb.rpc("console_replace_season", {
            "p_season": season, "p_batting": to_py(bat_rows), "p_pitching": to_py(pit_rows),
            "p_actor": actor, "p_source": source,
        }).execute().data
        return WriteResult(True, f"{season} 시즌 저장 완료",
                           {"타자": res["batting"], "투수": res["pitching"], "신규 선수": new_players,
                            "이전 타자 행": res["before_batting"], "이전 투수 행": res["before_pitching"]})

    # 셀 단위 수정 ───────────────────────────────────────────────────────────
    EDITABLE = {
        "players": {"number", "name", "is_pitcher"},
        "batting_stats": {"pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"},
        "pitching_stats": {"w", "l", "sv", "hld", "ip", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed"},
    }

    def update_rows(self, table, changes, actor):
        if not self.audit_ready():
            return WriteResult(False, f"감사 로그 테이블({AUDIT_TABLE})이 없습니다.")
        allowed = self.EDITABLE.get(table, set())
        n = 0
        for ch in changes:
            fields = {k: v for k, v in ch["after"].items() if k in allowed}
            if not fields:
                continue
            self.sb.table(table).update(fields).eq("id", ch["id"]).execute()
            self._audit(actor, "update", table, {"id": ch["id"], **ch["before"]}, {"id": ch["id"], **fields}, ch.get("note"))
            n += 1
        return WriteResult(True, f"{n}행 저장", {"rows": n})

    # 상황 기록 ──────────────────────────────────────────────────────────────
    def log_situation(self, situation, decision, actor):
        diff = situation["score_us"] - situation["score_them"]
        li = self.sb.rpc("calculate_leverage", {"p_inning": situation["inning"], "p_out_count": situation["out_count"],
                                                "p_score_diff": diff, "p_base_state": situation["base_state"]}).execute().data
        li = (li[0] if isinstance(li, list) and li else li) or {}
        sit = self.sb.table("situations").insert({**situation, "leverage_index": li.get("li"),
                                                  "leverage_class": li.get("lc") or "medium", "logged_by": actor}).execute().data[0]
        if decision:
            self.sb.table("game_decisions").insert({**decision, "situation_id": sit["id"], "game_id": situation["game_id"],
                                                    "season": situation["season"], "logged_by": actor}).execute()
        self._audit(actor, "insert", "situations", None, {"situation": sit, "decision": decision})
        return WriteResult(True, f"상황 기록 완료 (LI {li.get('li')}, {li.get('lc')})")

    def save_ai_report(self, report, actor):
        row = self.sb.table("ai_reports").insert(report).execute().data[0]
        self._audit(actor, "insert", "ai_reports", None, {"id": row["id"], "report_type": report.get("report_type")})
        return WriteResult(True, "리포트 저장")
