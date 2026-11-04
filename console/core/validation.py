"""
업로드 전 검증. 결과는 Issue 리스트로 돌려주고, 'error'가 하나라도 있으면 저장 버튼을 막는다.

검사 항목
  1. 합계 행 일치      : 선수 행 합계 == 시트 하단 '통산'/'○○ 시즌' 행
  2. 비율 지표 재계산  : 시트의 타율·출루율·장타율·OPS == 콘솔 공식
  3. 학기 → 시즌 합산  : "23 Spring" + "23 Summer" + "23 Fall" == "2023"
  4. 경기 로그 → 학기  : 경기별 시트 합계 == 학기 요약 시트
  5. 통산 파일 교차검증: Career 파일의 시즌 시트 == 시즌 파일, Career Totals == 시즌 합
"""
from __future__ import annotations

import pandas as pd

from .parser import Issue, ParsedWorkbook
from .stats import BATTING_COUNTS, PITCHING_COUNTS, batting_rates

RATE_TOL = 0.0015
KEYS = ["number", "name"]


def _counts(kind):
    return BATTING_COUNTS if kind == "batting" else PITCHING_COUNTS


def _frame(pw: ParsedWorkbook, kind):
    return pw.batting if kind == "batting" else pw.pitching


def check_footers(pw: ParsedWorkbook) -> list[Issue]:
    """시트 하단 합계 행 대조. 콘솔은 선수 행만 저장하고 합계는 직접 계산하므로 '경고'로 둔다.
    실제 기록지에서는 행을 추가한 뒤 SUM 범위를 늘리지 않아 합계 행이 틀린 경우가 대부분이었다."""
    issues = []
    if pw.footers.empty:
        return issues
    for _, f in pw.footers.iterrows():
        df = _frame(pw, f["kind"])
        part = df[(df["scope"] == f["scope"]) & (df["sheet"] == f["sheet"])] if not df.empty else df
        # outs는 합계 행이 이닝 표기를 소수로 더해 원래 맞지 않으므로 제외
        cols = [c for c in _counts(f["kind"]) if c in part and c != "outs"]
        diffs = [f"{c} {int(part[c].sum())}/{int(f.get(c, 0) or 0)}" for c in cols if int(part[c].sum()) != int(f.get(c, 0) or 0)]
        if not diffs:
            continue
        hint = ""
        key = "pa" if f["kind"] == "batting" else "bf"
        vals = list(part[key]) if key in part else []
        for k in range(len(vals)):
            if sum(vals[:k]) == int(f.get(key, 0) or 0) and k < len(vals):
                missing = ", ".join(part["name"].iloc[k:].tolist())
                hint = f" — SUM 범위가 위쪽 {k}명만 포함하는 것으로 보임(누락: {missing})"
                break
        issues.append(Issue("warning", f["sheet"],
                            f"[{'타자' if f['kind']=='batting' else '투수'}] '{f['label']}' 합계 행이 선수 합계와 다름 "
                            f"(선수합/합계행: {', '.join(diffs[:5])}{' …' if len(diffs) > 5 else ''}){hint}",
                            int(f["row"])))
    return issues


def check_batting_rates(pw: ParsedWorkbook) -> list[Issue]:
    issues = []
    for _, r in pw.batting.iterrows():
        calc = batting_rates(r.hits, r.ab, r.pa, r.bb, r.hbp, r.doubles, r.triples, r.hr)
        for key, label in (("avg", "타율"), ("obp", "출루율"), ("slg", "장타율"), ("ops", "OPS")):
            sheet_val, mine = r.get(f"sheet_{key}"), getattr(calc, key)
            if sheet_val is None or pd.isna(sheet_val) or mine is None:
                continue
            if abs(sheet_val - mine) > RATE_TOL:
                issues.append(Issue("warning", r["sheet"],
                                    f"{r['number']}. {r['name']} {label}: 시트 {sheet_val:.3f} / 재계산 {mine:.3f} (시트 수식 확인 필요)",
                                    int(r["row"])))
    return issues


def _sum_by_player(df, cols):
    present = [c for c in cols if c in df]
    return df.groupby(KEYS)[present].sum()


def _compare(a: pd.DataFrame, b: pd.DataFrame, label_a, label_b, sheet, level="warning", max_items=15) -> list[Issue]:
    issues = []
    joined = a.join(b, how="outer", lsuffix="_a", rsuffix="_b").fillna(0)
    cols = [c[:-2] for c in joined.columns if c.endswith("_a")]
    for (num, name), row in joined.iterrows():
        diffs = [f"{c} {int(row[c+'_a'])}→{int(row[c+'_b'])}" for c in cols if int(row[c + "_a"]) != int(row[c + "_b"])]
        if diffs:
            issues.append(Issue(level, sheet, f"{num}. {name}: {label_a} vs {label_b} 불일치 ({', '.join(diffs[:4])}{' …' if len(diffs) > 4 else ''})"))
    if len(issues) > max_items:
        extra = len(issues) - max_items
        issues = issues[:max_items] + [Issue(level, sheet, f"…외 {extra}명 불일치")]
    return issues


def check_terms_vs_season(pw: ParsedWorkbook) -> list[Issue]:
    issues = []
    for kind in ("batting", "pitching"):
        df = _frame(pw, kind)
        if df.empty:
            continue
        cols = _counts(kind)
        seasons = {s for s in df["scope"] if " " not in s and s != "Career"}
        for season in seasons:
            terms = df[df["scope"].str.startswith(season + " ")]
            if terms.empty:
                continue
            issues += _compare(_sum_by_player(terms, cols), _sum_by_player(df[df["scope"] == season], cols),
                               "학기 합", "시즌 시트", f"{season} ({'타자' if kind=='batting' else '투수'})")
    return issues


def check_games_vs_terms(pw: ParsedWorkbook) -> list[Issue]:
    issues = []
    for kind, games in (("batting", pw.batting_games), ("pitching", pw.pitching_games)):
        df = _frame(pw, kind)
        if games.empty or df.empty:
            continue
        cols = [c for c in _counts(kind) if c != "g"]
        for (season, term), part in games.groupby(["season", "term"]):
            scope = f"{season} {term}"
            summary = df[df["scope"] == scope]
            if summary.empty:
                continue
            issues += _compare(_sum_by_player(part, cols), _sum_by_player(summary, cols),
                               "경기 로그 합", "학기 시트", f"{scope} ({'타자' if kind=='batting' else '투수'})")
    return issues


def check_cross_files(workbooks: list[ParsedWorkbook]) -> list[Issue]:
    """여러 파일을 함께 올렸을 때: 통산 파일의 시즌 시트·Career Totals를 시즌 파일과 대조."""
    issues = []
    career = [w for w in workbooks if w.season_fallback == "Career"]
    seasons = [w for w in workbooks if w.season_fallback not in (None, "Career")]
    for cw in career:
        for kind in ("batting", "pitching"):
            cdf = _frame(cw, kind)
            if cdf.empty:
                continue
            cols = _counts(kind)
            label = "타자" if kind == "batting" else "투수"
            season_rows = []
            for sw in seasons:
                sdf = _frame(sw, kind)
                s = sw.season_fallback
                if sdf.empty or s not in set(sdf["scope"]):
                    continue
                season_rows.append(sdf[sdf["scope"] == s])
                if s in set(cdf["scope"]):
                    issues += _compare(_sum_by_player(cdf[cdf["scope"] == s], cols),
                                       _sum_by_player(sdf[sdf["scope"] == s], cols),
                                       "통산파일", "시즌파일", f"{s} ({label})")
            # 통산 = 통산 파일 안의 시즌 시트 합 (시즌 파일이 없는 연도도 포함)
            in_file = cdf[(cdf["scope"] != "Career")]
            if not in_file.empty:
                issues += _compare(_sum_by_player(cdf[cdf["scope"] == "Career"], cols), _sum_by_player(in_file, cols),
                                   "Career Totals", "시즌 시트 합", f"Career ({label})")
    return issues


def check_footer_labels(pw: ParsedWorkbook) -> list[Issue]:
    """'25 Spring' 시트 합계 행이 '2025 Fall 시즌'으로 적혀 있는 식의 복사·붙여넣기 흔적."""
    issues = []
    for _, f in pw.footers.iterrows():
        label, scope = str(f["label"]), f["scope"]
        if " " not in scope:
            continue
        term = scope.split(" ")[1]
        other = [t for t in ("Spring", "Summer", "Fall") if t != term and t.lower() in label.lower()]
        if other:
            issues.append(Issue("warning", f["sheet"], f"합계 행 라벨 '{label}'이 시트 학기({term})와 다름 — 복사 후 미수정 의심", int(f["row"])))
    return issues


def check_identity(pw: ParsedWorkbook) -> list[Issue]:
    """같은 이름이 다른 배번으로 기록된 경우. 선수 매칭이 (배번, 이름) 기준이라 동일인이 둘로 갈라진다."""
    frames = [d[["number", "name", "sheet"]] for d in (pw.batting, pw.pitching, pw.batting_games, pw.pitching_games) if not d.empty]
    if not frames:
        return []
    allp = pd.concat(frames)
    issues = []
    for name, part in allp.groupby("name"):
        nums = sorted(set(part["number"]))
        if len(nums) > 1:
            where = "; ".join(f"#{n}: {', '.join(sorted(set(part[part.number == n]['sheet'])))}" for n in nums)
            issues.append(Issue("warning", "(전체)", f"'{name}' 배번이 시트마다 다름 ({where}) — 동명이인이 아니면 배번 통일 필요"))
    return issues


def validate(pw: ParsedWorkbook) -> list[Issue]:
    return (
        list(pw.issues)
        + check_identity(pw)
        + check_footer_labels(pw)
        + check_footers(pw)
        + check_batting_rates(pw)
        + check_terms_vs_season(pw)
        + check_games_vs_terms(pw)
    )


def has_blocking(issues: list[Issue]) -> bool:
    return any(i.level == "error" for i in issues)
