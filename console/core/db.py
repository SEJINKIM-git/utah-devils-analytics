"""
데이터 접근 계층.

  · SupabaseRepo : 운영 DB (홈페이지·기존 플랫폼과 같은 프로젝트)
  · LocalRepo    : secrets가 없을 때 tests/fixtures의 엑셀로 띄우는 읽기 전용 데모

모든 쓰기는 이 파일을 거치고, 테이블에 직접 insert/update/delete 하지 않는다.
쓰기마다 DB 함수(sql/001·005·006의 console_*)가 변경과 console_audit_log 기록을 한 트랜잭션으로 처리한다.
홈페이지가 읽는 테이블 구조(ip를 야구식 표기로 저장 등)는 바꾸지 않는다.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .parser import parse_workbook
from .stats import outs_to_ip

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
AUDIT_TABLE = "console_audit_log"

# 각 DB 함수가 어느 마이그레이션에 들어 있는지 — 없을 때 안내 문구에 쓴다
RPC_MIGRATION = {
    "console_replace_season": "sql/001_audit_log_and_report_season.sql",
    "console_replace_game": "sql/005_game_sheet_v3.sql",
    "console_update_rows": "sql/006_console_writes.sql",
    "console_log_situation": "sql/006_console_writes.sql",
    "console_save_ai_report": "sql/006_console_writes.sql",
}


@dataclass
class WriteResult:
    ok: bool
    message: str
    counts: dict | None = None


class ConsoleWriteError(Exception):
    """쓰기 실패 — 메시지는 그대로 화면에 보여 줄 수 있는 안내 문구."""


def name_key(name) -> str:
    return re.sub(r"\s+", "", str(name or "")).lower()


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

    # 저장 가능 여부 (마이그레이션 적용 상태). 데모는 항상 저장 불가.
    def v3_ready(self) -> bool: return False
    def ambiguous_names(self, names) -> list[str]: return []

    # 쓰기 (LocalRepo는 거부)
    def replace_season(self, season, batting, pitching, actor, source) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def update_rows(self, table, changes: list[dict], actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def log_situation(self, situation: dict, decision: dict | None, actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def save_ai_report(self, report: dict, actor) -> WriteResult:
        return WriteResult(False, "읽기 전용 데모 모드입니다.")

    def replace_game(self, sheet, actor) -> WriteResult:
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

    # 마이그레이션 상태 ───────────────────────────────────────────────────────
    def audit_ready(self) -> bool:
        try:
            self.sb.table(AUDIT_TABLE).select("id").limit(1).execute()
            return True
        except Exception:
            return False

    def v3_ready(self) -> bool:
        """sql/005 적용 여부 — 희생플라이 칸이 있으면 console_replace_game도 함께 들어온 것."""
        try:
            self.sb.table("batting_stats").select("sf").limit(1).execute()
            return True
        except Exception:
            return False

    # DB 함수 호출 ────────────────────────────────────────────────────────────
    def _rpc(self, name: str, params: dict):
        """모든 쓰기는 여기를 거친다. 함수가 없으면(마이그레이션 미적용) 어떤 파일을 적용할지 알려 준다."""
        to_py = json.loads(json.dumps(params, default=_json_default))  # numpy 숫자 → 파이썬 숫자
        try:
            return self.sb.rpc(name, to_py).execute().data
        except Exception as e:  # postgrest APIError 등
            code = str(getattr(e, "code", "") or "")
            text = str(getattr(e, "message", "") or e)
            if code == "PGRST202" or name in text or ("function" in text.lower() and "exist" in text.lower()):
                raise ConsoleWriteError(
                    f"DB 함수 {name}이(가) 없습니다. 저장소의 {RPC_MIGRATION.get(name, 'sql/')}을(를) Supabase SQL Editor에서 먼저 적용하세요."
                ) from e
            raise ConsoleWriteError(f"저장 실패 (DB 오류): {text}") from e

    # 선수 매칭 ──────────────────────────────────────────────────────────────
    def _identity_cache(self) -> dict[str, tuple[int, bool]]:
        """(배번, 이름) → (대표 id, 투수 여부). 같은 (배번, 이름) 중복 레코드는 최신 id 하나로."""
        from .aggregate import canonical_players

        players = self.players()
        if players.empty:
            return {}
        cp = canonical_players(players)
        pitcher_by_id = dict(zip(players["id"], players["is_pitcher"].fillna(False).astype(bool)))
        return {r.identity: (int(r.canonical_id), bool(pitcher_by_id.get(r.canonical_id, False))) for r in cp.itertuples()}

    @staticmethod
    def _player_ref(cache: dict, number, name, pitcher: bool) -> dict:
        """RPC 행의 선수 부분: 기존 선수면 player_id(+set_pitcher), 아니면 number·name·is_pitcher (DB 함수가 만든다)."""
        from .aggregate import identity_key

        hit = cache.get(identity_key(number, name))
        if hit:
            pid, is_pitcher = hit
            return {"player_id": pid, **({"set_pitcher": True} if pitcher and not is_pitcher else {})}
        return {"number": int(number), "name": str(name).strip(), "is_pitcher": bool(pitcher)}

    def _name_groups(self) -> dict[str, dict[int, int]]:
        """이름(공백 제거·소문자) → {대표 id: 배번}. 경기 기록지(배번 없음)의 이름 매칭용."""
        from .aggregate import canonical_players

        players = self.players()
        groups: dict[str, dict[int, int]] = {}
        if players.empty:
            return groups
        for r in canonical_players(players).itertuples():
            groups.setdefault(name_key(r.name), {})[int(r.canonical_id)] = int(r.number or 0)
        return groups

    def ambiguous_names(self, names) -> list[str]:
        """같은 이름이 서로 다른 배번으로 둘 이상 등록돼 있어 어느 선수인지 정할 수 없는 이름들의 안내 문구."""
        groups = self._name_groups()
        players = self.players()
        out = []
        for name in sorted({str(n).strip() for n in names if str(n).strip()}):
            g = groups.get(name_key(name), {})
            if len(set(g.values())) > 1:
                detail = ", ".join(f"#{num} {players.loc[players.id == pid, 'name'].iloc[0]} (id {pid})" for pid, num in sorted(g.items(), key=lambda kv: kv[1]))
                out.append(f"'{name}' 이름의 선수가 {len(g)}명 있어 어느 선수의 기록인지 정할 수 없습니다: {detail}. "
                           "기록지 이름에 구분자를 붙이거나 선수 명단을 정리한 뒤 다시 올려 주세요.")
        return out

    # 시즌 교체 업로드 ───────────────────────────────────────────────────────
    def replace_season(self, season, batting, pitching, actor, source):
        """기존 업로드와 같은 의미(해당 시즌 요약 행 교체) + 멱등성 + 감사 로그.
        경기별 행(game_id 있음)과 games·situations는 건드리지 않는다. 같은 파일을 두 번 올려도 결과가 같다."""
        if not self.audit_ready():
            return WriteResult(False, f"감사 로그 테이블({AUDIT_TABLE})이 없습니다. 저장소의 {RPC_MIGRATION['console_replace_season']}을 먼저 적용하세요.")
        cache = self._identity_cache()
        bat_rows = [{**self._player_ref(cache, r.number, r.name, False),
                     "pa": r.pa, "ab": r.ab, "runs": r.runs, "hits": r.hits, "doubles": r.doubles, "triples": r.triples,
                     "hr": r.hr, "rbi": r.rbi, "bb": r.bb, "hbp": r.hbp, "so": r.so, "sb": r.sb}
                    for r in batting.itertuples()]
        # 홈페이지 호환: ip는 기존처럼 야구식 표기 숫자로 저장 (46.2)
        pit_rows = [{**self._player_ref(cache, r.number, r.name, True),
                     "w": r.w, "l": r.l, "sv": r.sv, "hld": r.hld, "ip": float(outs_to_ip(r.outs)), "ha": r.ha,
                     "runs_allowed": r.runs_allowed, "er": r.er, "bb": r.bb, "hbp": r.hbp, "so": r.so, "hr_allowed": r.hr_allowed}
                    for r in pitching.itertuples()]
        try:
            res = self._rpc("console_replace_season", {"p_season": season, "p_batting": bat_rows, "p_pitching": pit_rows,
                                                       "p_actor": actor, "p_source": source})
        except ConsoleWriteError as e:
            return WriteResult(False, str(e))
        return WriteResult(True, f"{season} 시즌 저장 완료",
                           {"타자": res["batting"], "투수": res["pitching"], "신규 선수": res.get("new_players", 0),
                            "이전 타자 행": res["before_batting"], "이전 투수 행": res["before_pitching"]})

    # 셀 단위 수정 ───────────────────────────────────────────────────────────
    EDITABLE = {
        "players": {"number", "name", "is_pitcher"},
        "batting_stats": {"pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb"},
        "pitching_stats": {"w", "l", "sv", "hld", "ip", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed"},
    }

    def update_rows(self, table, changes, actor):
        allowed = self.EDITABLE.get(table, set())
        payload = []
        for ch in changes:
            fields = {k: v for k, v in ch["after"].items() if k in allowed}
            if fields:
                payload.append({"id": int(ch["id"]), "after": fields, "note": ch.get("note")})
        if not payload:
            return WriteResult(True, "바뀐 값이 없습니다.", {"rows": 0})
        try:
            n = self._rpc("console_update_rows", {"p_table": table, "p_changes": payload, "p_actor": actor})
        except ConsoleWriteError as e:
            return WriteResult(False, str(e))
        return WriteResult(True, f"{n}행 저장", {"rows": int(n or 0)})

    # 상황 기록 ──────────────────────────────────────────────────────────────
    def log_situation(self, situation, decision, actor):
        try:
            res = self._rpc("console_log_situation", {"p_situation": situation, "p_decision": decision, "p_actor": actor})
        except ConsoleWriteError as e:
            return WriteResult(False, str(e))
        return WriteResult(True, f"상황 기록 완료 (LI {res.get('li')}, {res.get('lc')})", res)

    # 경기 기록지 v3.0 ─────────────────────────────────────────────────────
    def replace_game(self, sheet, actor):
        """경기 하나를 원자적으로 교체 (sql/005 console_replace_game). 기록지에 배번이 없으므로 이름으로 선수를 찾는다.
        같은 이름이 다른 배번으로 여럿이면(동명이인) 저장하지 않고 안내한다. 처음 보는 이름은 DB 함수가 임시 배번으로 만든다."""
        if not self.audit_ready():
            return WriteResult(False, f"감사 로그 테이블({AUDIT_TABLE})이 없습니다. 저장소의 {RPC_MIGRATION['console_replace_season']}을 먼저 적용하세요.")
        if not self.v3_ready():
            return WriteResult(False, f"DB에 경기 기록지 v3.0 칸(희생플라이·희생번트·포수방해·투구수)과 경기 교체 함수가 없습니다. "
                                      f"저장소의 {RPC_MIGRATION['console_replace_game']}을 Supabase SQL Editor에서 적용한 뒤 다시 저장하세요.")
        info = sheet.info
        if not (info.get("date") and info.get("opponent") and info.get("season")):
            return WriteResult(False, "경기 날짜와 상대팀을 찾지 못했습니다.")

        names = list(sheet.batting["name"]) + list(sheet.pitching["name"])
        ambiguous = self.ambiguous_names(names)
        if ambiguous:
            return WriteResult(False, "동명이인 때문에 저장하지 않았습니다.\n\n" + "\n\n".join(f"- {m}" for m in ambiguous))

        groups = self._name_groups()
        players = self.players()
        pitcher_by_id = dict(zip(players["id"], players["is_pitcher"].fillna(False).astype(bool))) if not players.empty else {}

        def ref(name, pitcher):
            g = groups.get(name_key(name))
            if g:
                pid = max(g)  # 같은 (배번, 이름) 중복 레코드는 최신 것
                return {"player_id": pid, **({"set_pitcher": True} if pitcher and not pitcher_by_id.get(pid, False) else {})}
            return {"name": str(name).strip(), "is_pitcher": bool(pitcher)}  # 배번 없음 → DB 함수가 900번대 임시 배번

        bat = [{**ref(r.name, r.position == "P"), **{c: int(getattr(r, c)) for c in (
            "pa", "ab", "runs", "hits", "doubles", "triples", "hr", "rbi", "bb", "hbp", "so", "sb", "sf", "sh", "ci")}}
               for r in sheet.batting.itertuples()]
        pit = [{**ref(r.name, True), "ip": float(outs_to_ip(r.outs)), **{c: int(getattr(r, c)) for c in (
            "w", "l", "sv", "hld", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed", "pitches")}}
               for r in sheet.pitching.itertuples()]
        us = info.get("score_us") if info.get("score_us") is not None else int(sheet.batting["runs"].sum())
        them = info.get("score_them") if info.get("score_them") is not None else int(sheet.pitching["runs_allowed"].sum())
        game = {"date": info["date"], "opponent": info["opponent"], "is_home": info.get("is_home"),
                "location": info.get("location"), "score_us": us, "score_them": them,
                "result": "W" if us > them else "L" if us < them else ("D" if us or them else None),
                "notes": " | ".join(sheet.highlights) or None}
        try:
            res = self._rpc("console_replace_game", {"p_season": info["season"], "p_game": game, "p_batting": bat,
                                                     "p_pitching": pit, "p_actor": actor, "p_source": sheet.source})
        except ConsoleWriteError as e:
            return WriteResult(False, str(e))
        new_names = [row["name"] for row in bat + pit if "name" in row]
        return WriteResult(True, f"{info['date']} vs {info['opponent']} 저장 완료",
                           {"경기": "새 경기" if res["created"] else f"기존 경기 #{res['game_id']}",
                            "타자": res["batting"], "투수": res["pitching"],
                            "이전 타자 행": res["before_batting"], "이전 투수 행": res["before_pitching"],
                            "신규 선수": ", ".join(dict.fromkeys(new_names)) or "없음"})

    def save_ai_report(self, report, actor):
        try:
            self._rpc("console_save_ai_report", {"p_report": report, "p_actor": actor})
        except ConsoleWriteError as e:
            return WriteResult(False, str(e))
        return WriteResult(True, "리포트 저장")


def _json_default(value):
    """numpy 정수·실수, NaN을 JSON으로."""
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)
