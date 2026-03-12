export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TARGET_SEASON = "2026";

type RosterPlayer = { number: number; name: string; position?: string; is_pitcher?: boolean };

function isStatSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length === 0) return false;
  const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  return ["날짜", "타석", "타수", "이닝", "상대팀"].some((c) => headers.includes(c));
}

function extractRosterPlayers(workbook: XLSX.WorkBook): RosterPlayer[] {
  const sheetName = workbook.SheetNames.includes("전체") ? "전체" : workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) return [];
  const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  const numCol = headers.indexOf("배번");
  const nameCol = headers.indexOf("이름");
  const roster: RosterPlayer[] = [];
  if (numCol !== -1 && nameCol !== -1) {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      const number = Number(row[numCol]);
      const name = String(row[nameCol] ?? "").trim();
      if (!number || !name) continue;
      roster.push({ number, name });
    }
  }
  return roster.sort((a, b) => a.number - b.number);
}

// ── ID 목록을 가져와서 하나씩 삭제 (RLS 우회)
async function deleteAll(table: string): Promise<number> {
  const { data } = await supabase.from(table).select("id");
  if (!data || data.length === 0) return 0;
  
  const ids = data.map((r: { id: string }) => r.id);
  
  // 50개씩 배치 삭제
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (!error) deleted += batch.length;
  }
  return deleted;
}

async function resetAllData() {
  // 순서 중요: stats 먼저 → players → uploads (FK 제약)
  const batting  = await deleteAll("batting_stats");
  const pitching = await deleteAll("pitching_stats");
  const players  = await deleteAll("players");
  
  // roster_uploads: id 컬럼 이름 확인 후 삭제
  const { data: uploads } = await supabase.from("roster_uploads").select("id");
  let uploadsDeleted = 0;
  if (uploads && uploads.length > 0) {
    const ids = uploads.map((r: { id: string }) => r.id);
    await supabase.from("roster_uploads").delete().in("id", ids);
    uploadsDeleted = ids.length;
  }

  return { batting_deleted: batting, pitching_deleted: pitching, players_deleted: players, uploads_deleted: uploadsDeleted };
}

// ── 선수 등록 + 2026 시즌 초기화
async function registerPlayers(players: RosterPlayer[]) {
  const results = { players_added: 0, batting_created: 0, pitching_created: 0 };

  for (const p of players) {
    const { data: created, error } = await supabase
      .from("players")
      .insert({
        number: p.number,
        name: p.name,
        is_pitcher: p.is_pitcher ?? false,
        position: p.position ?? null,
      })
      .select("id")
      .single();

    if (!created || error) continue;
    results.players_added++;

    await supabase.from("batting_stats").insert({
      player_id: created.id, season: TARGET_SEASON,
      pa:0, ab:0, runs:0, hits:0, doubles:0, triples:0, hr:0, rbi:0, bb:0, hbp:0, so:0, sb:0,
    });
    results.batting_created++;

    await supabase.from("pitching_stats").insert({
      player_id: created.id, season: TARGET_SEASON,
      w:0, l:0, sv:0, hld:0, ip:0, ha:0, runs_allowed:0, er:0, bb:0, hbp:0, so:0, hr_allowed:0,
    });
    results.pitching_created++;
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const confirmReset = formData.get("confirm") === "RESET";

    if (!confirmReset) {
      return NextResponse.json({ error: "초기화 확인이 필요합니다" }, { status: 400 });
    }

    // ── Step 1: 전체 삭제
    const resetResult = await resetAllData();

    // ── Step 2: 새 명단 등록
    const manualJson = formData.get("manual") as string | null;
    const file = formData.get("file") as File | null;

    let players: RosterPlayer[] = [];

    if (manualJson) {
      players = JSON.parse(manualJson);
    } else if (file) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
      const hasStatSheet =
        workbook.SheetNames.includes("경기") ||
        (workbook.SheetNames.includes("타자") && isStatSheet(workbook.Sheets["타자"])) ||
        (workbook.SheetNames.includes("투수") && isStatSheet(workbook.Sheets["투수"]));

      if (!hasStatSheet) {
        players = extractRosterPlayers(workbook);
      }
    }

    let registerResult = { players_added: 0, batting_created: 0, pitching_created: 0 };
    if (players.length > 0) {
      registerResult = await registerPlayers(players);

      const filename = file ? file.name : "직접 입력 (초기화)";
      await supabase.from("roster_uploads").insert({
        filename,
        player_count: players.length,
        added_count: registerResult.players_added,
        updated_count: 0,
        source: file ? "file" : "manual",
        players_snapshot: JSON.stringify(players),
        uploaded_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      reset: resetResult,
      register: registerResult,
      message: `초기화 완료! 기존 데이터 삭제 후 ${registerResult.players_added}명 새로 등록됐습니다.`,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}