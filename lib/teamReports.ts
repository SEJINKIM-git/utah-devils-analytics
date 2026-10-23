import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 팀 AI 리포트는 시즌별로 저장·조회한다 (ai_reports.season, sql/001 마이그레이션).
 * 마이그레이션 적용 전에도 깨지지 않도록 season 컬럼이 없으면 이전 방식으로 동작한다.
 */

export type TeamReportFields = {
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  training_plan: string | null;
};

export type TeamReportRow = TeamReportFields & { generated_at: string | null };

type PgError = { code?: string; message?: string } | null;

export function isMissingSeasonColumn(error: PgError) {
  if (!error) return false;
  // 42703 = undefined_column, PGRST204 = PostgREST 스키마 캐시에 없는 컬럼
  const message = error.message ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (/season/i.test(message) && /column/i.test(message));
}

export async function fetchTeamReport(supabase: SupabaseClient, season: string): Promise<TeamReportRow | null> {
  const scoped = await supabase
    .from("ai_reports")
    .select("summary, strengths, improvements, training_plan, generated_at")
    .eq("report_type", "team")
    .eq("season", season)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!scoped.error) return (scoped.data as TeamReportRow | null) ?? null;
  if (!isMissingSeasonColumn(scoped.error)) return null;

  // 마이그레이션 전: 시즌 구분 없이 최신 리포트 1건
  const legacy = await supabase
    .from("ai_reports")
    .select("summary, strengths, improvements, training_plan, generated_at")
    .eq("report_type", "team")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (legacy.data as TeamReportRow | null) ?? null;
}

export async function saveTeamReport(supabase: SupabaseClient, season: string, fields: TeamReportFields) {
  const del = await supabase.from("ai_reports").delete().eq("report_type", "team").eq("season", season);

  if (del.error && isMissingSeasonColumn(del.error)) {
    // 마이그레이션 전: 이전 동작 (팀 리포트는 1건만 유지)
    const legacyDel = await supabase.from("ai_reports").delete().eq("report_type", "team");
    if (legacyDel.error) throw new Error(legacyDel.error.message);
    const ins = await supabase.from("ai_reports").insert({ player_id: null, report_type: "team", ...fields });
    if (ins.error) throw new Error(ins.error.message);
    return;
  }
  if (del.error) throw new Error(del.error.message);

  const ins = await supabase.from("ai_reports").insert({ player_id: null, report_type: "team", season, ...fields });
  if (ins.error) throw new Error(ins.error.message);
}
