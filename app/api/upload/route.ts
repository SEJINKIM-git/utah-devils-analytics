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
type ConflictPlayer = RosterPlayer & { existingId: string; existingName: string; existingNumber: number };

// ── 시트가 통계 형식인지 판단
function isStatSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length === 0) return false;
  const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  return ["날짜", "타석", "타수", "이닝", "상대팀"].some((col) => headers.includes(col));
}

// ── 로스터 추출: 배번|이름 2열 또는 분홍색(EA9999) 다중열
function extractRosterPlayers(workbook: XLSX.WorkBook): RosterPlayer[] {
  const sheetName = workbook.SheetNames.includes("전체") ? "전체" : workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) return [];

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  const numCol  = headers.indexOf("배번");
  const nameCol = headers.indexOf("이름");
  const roster: RosterPlayer[] = [];

  if (numCol !== -1 && nameCol !== -1) {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      const number = Number(row[numCol]);
      const name   = String(row[nameCol] ?? "").trim();
      if (!number || !name) continue;
      roster.push({ number, name });
    }
    return roster.sort((a, b) => a.number - b.number);
  }

  const ACTIVE_COLOR = "EA9999";
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (const base of [0, 2, 4, 6]) {
      const number = Number(row?.[base]);
      const name   = String(row?.[base + 1] ?? "").trim();
      if (!number || !name) continue;
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: base + 1 });
      const cell    = sheet[cellRef];
      const color   = cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || "";
      if (color === ACTIVE_COLOR) roster.push({ number, name });
    }
  }
  return roster.sort((a, b) => a.number - b.number);
}

// ── 중복 검사
async function detectConflicts(rosterPlayers: RosterPlayer[]): Promise<ConflictPlayer[]> {
  const { data: existing } = await supabase.from("players").select("id,name,number");
  if (!existing) return [];

  const conflicts: ConflictPlayer[] = [];
  for (const p of rosterPlayers) {
    const byNum  = existing.find((e) => e.number === p.number);
    const byName = existing.find((e) => e.name === p.name);
    const match  = byNum || byName;
    if (match) {
      conflicts.push({
        ...p,
        existingId: match.id,
        existingName: match.name,
        existingNumber: match.number,
      });
    }
  }
  return conflicts;
}

// ── 로스터 → 2026 시즌 초기화 (overwrite 시 이름·배번 업데이트)
async function initializeRosterSeason(rosterPlayers: RosterPlayer[], overwrite: boolean) {
  const results = { players: 0, updated: 0, batting: 0, pitching: 0, skipped_batting: 0, skipped_pitching: 0 };

  for (const rp of rosterPlayers) {
    let playerId: string | null = null;

    const { data: byNum } = await supabase.from("players").select("id,name,number").eq("number", rp.number).maybeSingle();
    const { data: byName } = await supabase.from("players").select("id,name,number").eq("name", rp.name).maybeSingle();
    const existing = byNum || byName;

    if (existing) {
      playerId = existing.id;
      if (overwrite) {
        const updates: Record<string, unknown> = {};
        if (existing.name !== rp.name) updates.name = rp.name;
        if (existing.number !== rp.number) updates.number = rp.number;
        if (Object.keys(updates).length > 0) {
          await supabase.from("players").update(updates).eq("id", existing.id);
          results.updated++;
        }
      }
    } else {
      const { data: created } = await supabase
        .from("players")
        .insert({ number: rp.number, name: rp.name, is_pitcher: rp.is_pitcher ?? false, position: rp.position ?? null })
        .select("id").single();
      if (created) { playerId = created.id; results.players++; }
    }

    if (!playerId) continue;

    const { data: exBat } = await supabase.from("batting_stats").select("id").eq("player_id", playerId).eq("season", TARGET_SEASON).limit(1);
    if (!exBat || exBat.length === 0) {
      await supabase.from("batting_stats").insert({ player_id: playerId, season: TARGET_SEASON, pa:0,ab:0,runs:0,hits:0,doubles:0,triples:0,hr:0,rbi:0,bb:0,hbp:0,so:0,sb:0 });
      results.batting++;
    } else { results.skipped_batting++; }

    const { data: exPit } = await supabase.from("pitching_stats").select("id").eq("player_id", playerId).eq("season", TARGET_SEASON).limit(1);
    if (!exPit || exPit.length === 0) {
      await supabase.from("pitching_stats").insert({ player_id: playerId, season: TARGET_SEASON, w:0,l:0,sv:0,hld:0,ip:0,ha:0,runs_allowed:0,er:0,bb:0,hbp:0,so:0,hr_allowed:0 });
      results.pitching++;
    } else { results.skipped_pitching++; }
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ── 수동 입력 모드 (파일 없이 JSON 선수 목록)
    const manualJson = formData.get("manual") as string | null;
    if (manualJson) {
      const players: RosterPlayer[] = JSON.parse(manualJson);
      const overwrite = formData.get("overwrite") === "true";
      const checkOnly = formData.get("checkOnly") === "true";

      const conflicts = await detectConflicts(players);

      if (checkOnly) {
        return NextResponse.json({ conflicts, total: players.length });
      }

      if (conflicts.length > 0 && !overwrite) {
        return NextResponse.json({ needsConfirm: true, conflicts, total: players.length });
      }

      const r = await initializeRosterSeason(players, overwrite);
      const skipped = r.skipped_batting > 0 ? ` (기존 기록 ${r.skipped_batting}건 유지)` : "";
      return NextResponse.json({
        success: true,
        message: `완료! 신규 ${r.players}명 추가${r.updated > 0 ? `, ${r.updated}명 정보 업데이트` : ""}${skipped}`,
        details: r,
      });
    }

    // ── 파일 업로드 모드
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

    const overwrite     = formData.get("overwrite") === "true";
    const checkOnly     = formData.get("checkOnly") === "true";
    const skipConflicts = formData.get("skipConflicts") === "true";

    const buffer   = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });

    const hasRealStatSheet =
      workbook.SheetNames.includes("경기") ||
      (workbook.SheetNames.includes("타자") && isStatSheet(workbook.Sheets["타자"])) ||
      (workbook.SheetNames.includes("투수") && isStatSheet(workbook.Sheets["투수"]));

    const rosterPlayers = extractRosterPlayers(workbook);

    if (!hasRealStatSheet && rosterPlayers.length > 0) {
      const conflicts = await detectConflicts(rosterPlayers);

      if (checkOnly) {
        return NextResponse.json({ conflicts, total: rosterPlayers.length });
      }
      if (conflicts.length > 0 && !overwrite && !skipConflicts) {
        return NextResponse.json({ needsConfirm: true, conflicts, total: rosterPlayers.length });
      }

      const toProcess = skipConflicts
        ? rosterPlayers.filter((p) => !conflicts.some((c) => c.name === p.name || c.existingNumber === p.number))
        : rosterPlayers;

      const r = await initializeRosterSeason(toProcess, overwrite);
      const skipped = r.skipped_batting > 0 ? ` (기존 기록 ${r.skipped_batting}건 유지)` : "";
      const skippedCount = skipConflicts && conflicts.length > 0 ? ` · 중복 ${conflicts.length}명 제외` : "";
      return NextResponse.json({
        success: true,
        message: `로스터 반영 완료! 신규 ${r.players}명 추가${r.updated > 0 ? `, ${r.updated}명 업데이트` : ""}${skipped}${skippedCount}`,
        details: r,
      });
    }

    // 통계 파일
    const results = { games: 0, batting: 0, pitching: 0 };

    if (workbook.SheetNames.includes("경기")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["경기"]) as Record<string, unknown>[];
      for (const row of rows) {
        const date = row["날짜"] as string, opponent = row["상대팀"] as string, season = row["시즌"] as string;
        if (!date || !opponent || !season) continue;
        const { data: ex } = await supabase.from("games").select("id").eq("date", date).eq("opponent", opponent);
        if (ex && ex.length > 0) continue;
        await supabase.from("games").insert({ date, opponent, season });
        results.games++;
      }
    }

    if (workbook.SheetNames.includes("타자")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["타자"]) as Record<string, unknown>[];
      for (const row of rows) {
        const playerNumber = Number(row["배번"]), name = row["이름"] as string;
        if (!playerNumber || !name) continue;
        let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).single();
        if (!player) { const { data: np } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: false }).select().single(); player = np; }
        if (!player) continue;
        let gameId = null, season: string | null = typeof row["시즌"] === "string" ? row["시즌"] as string : null;
        if (row["날짜"] && row["상대팀"]) {
          const { data: game } = await supabase.from("games").select("id,season").eq("date", row["날짜"] as string).eq("opponent", row["상대팀"] as string).single();
          if (game) { gameId = game.id; season = game.season || season; }
        }
        await supabase.from("batting_stats").insert({ player_id: player.id, game_id: gameId, season, pa: Number(row["타석"])||0, ab: Number(row["타수"])||0, runs: Number(row["득점"])||0, hits: Number(row["안타"])||0, doubles: Number(row["2루타"])||0, triples: Number(row["3루타"])||0, hr: Number(row["홈런"])||0, rbi: Number(row["타점"])||0, bb: Number(row["볼넷"])||0, hbp: Number(row["사구"])||0, so: Number(row["삼진"])||0, sb: Number(row["도루"])||0 });
        results.batting++;
      }
    }

    if (workbook.SheetNames.includes("투수")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["투수"]) as Record<string, unknown>[];
      for (const row of rows) {
        const playerNumber = Number(row["배번"]), name = row["이름"] as string;
        if (!playerNumber || !name) continue;
        let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).single();
        if (!player) { const { data: np } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: true }).select().single(); player = np; }
        if (!player) continue;
        let gameId = null, season: string | null = typeof row["시즌"] === "string" ? row["시즌"] as string : null;
        if (row["날짜"] && row["상대팀"]) {
          const { data: game } = await supabase.from("games").select("id,season").eq("date", row["날짜"] as string).eq("opponent", row["상대팀"] as string).single();
          if (game) { gameId = game.id; season = game.season || season; }
        }
        await supabase.from("pitching_stats").insert({ player_id: player.id, game_id: gameId, season, w: Number(row["승"])||0, l: Number(row["패"])||0, sv: Number(row["세"])||0, hld: Number(row["홀"])||0, ip: Number(row["이닝"])||0, ha: Number(row["피안타"])||0, runs_allowed: Number(row["실점"])||0, er: Number(row["자책"])||0, bb: Number(row["볼넷"])||0, hbp: Number(row["사구"])||0, so: Number(row["삼진"])||0, hr_allowed: Number(row["피홈런"])||0 });
        results.pitching++;
      }
    }

    return NextResponse.json({ success: true, message: `업로드 완료! 경기 ${results.games}개, 타자 ${results.batting}명, 투수 ${results.pitching}명 추가`, details: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}