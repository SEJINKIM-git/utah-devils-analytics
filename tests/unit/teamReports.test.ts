/**
 * 팀 AI 리포트의 시즌 구분 — ai_reports.season 컬럼이 없는 DB(sql/001 적용 전)에서도
 * 조회·저장이 이전 방식으로 동작하는지 가짜 Supabase 클라이언트로 확인한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchTeamReport, saveTeamReport } from "@/lib/teamReports";

type Row = Record<string, unknown>;
const MISSING = { code: "42703", message: "column ai_reports.season does not exist" };

/** ai_reports 하나만 흉내 내는 클라이언트. hasSeason=false면 season을 쓰는 모든 쿼리가 42703으로 실패한다. */
function fakeClient(rows: Row[], hasSeason: boolean) {
  const calls: string[] = [];
  const builder = (op: "select" | "delete" | "insert", payload?: Row) => {
    const filters: Array<[string, unknown]> = [];
    let usesSeason = op === "insert" && payload !== undefined && "season" in payload;
    const q = {
      eq(k: string, v: unknown) { filters.push([k, v]); if (k === "season") usesSeason = true; return q; },
      order() { return q; },
      limit() { return q; },
      async maybeSingle() { return q.then((r) => r); },
      then(resolve: (v: { data: Row | null; error: typeof MISSING | null }) => unknown) {
        calls.push(`${op}${usesSeason ? "+season" : ""}`);
        if (usesSeason && !hasSeason) return resolve({ data: null, error: MISSING });
        if (op === "insert") { rows.push(payload!); return resolve({ data: null, error: null }); }
        const matched = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
        if (op === "delete") { for (const r of matched) rows.splice(rows.indexOf(r), 1); return resolve({ data: null, error: null }); }
        return resolve({ data: matched[0] ?? null, error: null });
      },
    };
    return q;
  };
  const client = {
    from: () => ({
      select: () => builder("select"),
      delete: () => builder("delete"),
      insert: (payload: Row) => builder("insert", payload),
    }),
  } as unknown as SupabaseClient;
  return { client, calls, rows };
}

describe("fetchTeamReport", () => {
  it("season 컬럼이 있으면 그 시즌 리포트만 돌려준다", async () => {
    const { client } = fakeClient([
      { report_type: "team", season: "2025", summary: "작년", generated_at: "2025-11-01" },
      { report_type: "team", season: "2026", summary: "올해", generated_at: "2026-10-01" },
    ], true);
    expect((await fetchTeamReport(client, "2026"))?.summary).toBe("올해");
    expect(await fetchTeamReport(client, "2024")).toBeNull();      // 빈 시즌에는 지난 리포트를 보여 주지 않는다
  });

  it("season 컬럼이 없으면(마이그레이션 전) 시즌 구분 없이 최신 1건으로 대체한다", async () => {
    const { client, calls } = fakeClient([{ report_type: "team", summary: "구버전", generated_at: "2025-11-01" }], false);
    expect((await fetchTeamReport(client, "2026"))?.summary).toBe("구버전");
    expect(calls).toEqual(["select+season", "select"]);
  });
});

describe("saveTeamReport", () => {
  const fields = { summary: "s", strengths: "{}", improvements: "{}", training_plan: "p" };

  it("season 컬럼이 있으면 같은 시즌 리포트만 교체한다", async () => {
    const { client, rows } = fakeClient([
      { report_type: "team", season: "2025", summary: "작년" },
      { report_type: "team", season: "2026", summary: "옛 올해" },
    ], true);
    await saveTeamReport(client, "2026", fields);
    expect(rows.map((r) => [r.season, r.summary])).toEqual([["2025", "작년"], ["2026", "s"]]);
  });

  it("season 컬럼이 없으면 이전 동작(팀 리포트 1건 유지)으로 저장한다", async () => {
    const { client, rows, calls } = fakeClient([{ report_type: "team", summary: "구버전" }], false);
    await saveTeamReport(client, "2026", fields);
    expect(rows).toEqual([{ player_id: null, report_type: "team", ...fields }]);
    expect(calls).toEqual(["delete+season", "delete", "insert"]);
  });
});
