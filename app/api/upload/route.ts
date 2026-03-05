export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACTIVE_PLAYER_COLOR = "EA9999";
const TARGET_SEASON = "2026";

type RosterPlayer = {
  number: number;
  name: string;
};

function extractRosterPlayers(workbook: XLSX.WorkBook): RosterPlayer[] {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  const roster: RosterPlayer[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (const base of [0, 2, 4, 6]) {
      const rawNumber = row?.[base];
      const rawName = row?.[base + 1];
      const name = String(rawName || "").trim();
      const number = Number(rawNumber);

      if (!number || !name) continue;

      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: base + 1 });
      const cell = sheet[cellRef];
      const color = cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || "";

      if (color === ACTIVE_PLAYER_COLOR) {
        roster.push({ number, name });
      }
    }
  }

  return roster.sort((a, b) => a.number - b.number);
}

async function initializeRosterSeason(rosterPlayers: RosterPlayer[]) {
  const results = {
    mode: "roster",
    players: 0,
    batting: 0,
    pitching: 0,
    renamed: 0,
    skipped_batting: 0,
    skipped_pitching: 0,
    roster: rosterPlayers,
  };

  for (const rosterPlayer of rosterPlayers) {
    let playerRecord: { id: string; name?: string | null; number?: number | null; is_pitcher?: boolean | null } | null =
      null;

    const { data: byNumber } = await supabase
      .from("players")
      .select("id,name,number,is_pitcher")
      .eq("number", rosterPlayer.number)
      .maybeSingle();

    if (byNumber) {
      playerRecord = byNumber;
      const updates: Record<string, unknown> = {};
      if (byNumber.name !== rosterPlayer.name) updates.name = rosterPlayer.name;
      if (byNumber.number !== rosterPlayer.number) updates.number = rosterPlayer.number;

      if (Object.keys(updates).length > 0) {
        await supabase.from("players").update(updates).eq("id", byNumber.id);
        results.renamed++;
      }
    } else {
      const { data: byName } = await supabase
        .from("players")
        .select("id,name,number,is_pitcher")
        .eq("name", rosterPlayer.name)
        .maybeSingle();

      if (byName) {
        playerRecord = byName;
        if (byName.number !== rosterPlayer.number) {
          await supabase.from("players").update({ number: rosterPlayer.number }).eq("id", byName.id);
        }
      } else {
        const { data: created } = await supabase
          .from("players")
          .insert({
            number: rosterPlayer.number,
            name: rosterPlayer.name,
            is_pitcher: false,
          })
          .select("id,name,number,is_pitcher")
          .single();

        if (created) {
          playerRecord = created;
          results.players++;
        }
      }
    }

    if (!playerRecord) continue;

    const { data: existingBatting2026 } = await supabase
      .from("batting_stats")
      .select("id")
      .eq("player_id", playerRecord.id)
      .eq("season", TARGET_SEASON)
      .limit(1);

    if (!existingBatting2026 || existingBatting2026.length === 0) {
      await supabase.from("batting_stats").insert({
        player_id: playerRecord.id,
        season: TARGET_SEASON,
        pa: 0,
        ab: 0,
        runs: 0,
        hits: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        rbi: 0,
        bb: 0,
        hbp: 0,
        so: 0,
        sb: 0,
      });
      results.batting++;
    } else {
      results.skipped_batting++;
    }

    const { data: existingPitching2026 } = await supabase
      .from("pitching_stats")
      .select("id")
      .eq("player_id", playerRecord.id)
      .eq("season", TARGET_SEASON)
      .limit(1);

    if (!existingPitching2026 || existingPitching2026.length === 0) {
      await supabase.from("pitching_stats").insert({
        player_id: playerRecord.id,
        season: TARGET_SEASON,
        w: 0,
        l: 0,
        sv: 0,
        hld: 0,
        ip: 0,
        ha: 0,
        runs_allowed: 0,
        er: 0,
        bb: 0,
        hbp: 0,
        so: 0,
        hr_allowed: 0,
      });
      results.pitching++;
    } else {
      results.skipped_pitching++;
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
    const results = { games: 0, batting: 0, pitching: 0, errors: [] as string[] };

    const rosterPlayers = extractRosterPlayers(workbook);
    const hasStatSheets =
      workbook.SheetNames.includes("경기") ||
      workbook.SheetNames.includes("타자") ||
      workbook.SheetNames.includes("투수");

    if (!hasStatSheets && rosterPlayers.length > 0) {
      const rosterResults = await initializeRosterSeason(rosterPlayers);
      const skippedMsg =
        rosterResults.skipped_batting + rosterResults.skipped_pitching > 0
          ? ` (이미 존재해서 건너뜀: 타자 ${rosterResults.skipped_batting}건, 투수 ${rosterResults.skipped_pitching}건)`
          : "";

      return NextResponse.json({
        success: true,
        message: `로스터 반영 완료! 현재 선수 ${rosterResults.roster.length}명 기준으로 2026 타자 ${rosterResults.batting}건, 투수 ${rosterResults.pitching}건 생성${skippedMsg}`,
        details: rosterResults,
      });
    }

    if (workbook.SheetNames.includes("경기")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["경기"]) as Record<string, unknown>[];
      for (const row of rows) {
        const date = row["날짜"] as string;
        const opponent = row["상대팀"] as string;
        const season = row["시즌"] as string;
        if (!date || !opponent || !season) continue;
        const { data: existing } = await supabase.from("games").select("id").eq("date", date).eq("opponent", opponent);
        if (existing && existing.length > 0) continue;
        await supabase.from("games").insert({ date, opponent, season });
        results.games++;
      }
    }

    if (workbook.SheetNames.includes("타자")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["타자"]) as Record<string, unknown>[];
      for (const row of rows) {
        const playerNumber = Number(row["배번"]);
        const name = row["이름"] as string;
        if (!playerNumber || !name) continue;
        let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).single();
        if (!player) {
          const { data: np } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: false }).select().single();
          player = np;
        }
        if (!player) continue;
        let gameId = null;
        let season: string | null = typeof row["시즌"] === "string" ? (row["시즌"] as string) : null;
        if (row["날짜"] && row["상대팀"]) {
          const { data: game } = await supabase
            .from("games")
            .select("id, season")
            .eq("date", row["날짜"] as string)
            .eq("opponent", row["상대팀"] as string)
            .single();
          if (game) {
            gameId = game.id;
            season = game.season || season;
          }
        }
        await supabase.from("batting_stats").insert({ player_id: player.id, game_id: gameId, season, pa: Number(row["타석"]) || 0, ab: Number(row["타수"]) || 0, runs: Number(row["득점"]) || 0, hits: Number(row["안타"]) || 0, doubles: Number(row["2루타"]) || 0, triples: Number(row["3루타"]) || 0, hr: Number(row["홈런"]) || 0, rbi: Number(row["타점"]) || 0, bb: Number(row["볼넷"]) || 0, hbp: Number(row["사구"]) || 0, so: Number(row["삼진"]) || 0, sb: Number(row["도루"]) || 0 });
        results.batting++;
      }
    }

    if (workbook.SheetNames.includes("투수")) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["투수"]) as Record<string, unknown>[];
      for (const row of rows) {
        const playerNumber = Number(row["배번"]);
        const name = row["이름"] as string;
        if (!playerNumber || !name) continue;
        let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).single();
        if (!player) {
          const { data: np } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: true }).select().single();
          player = np;
        }
        if (!player) continue;
        let gameId = null;
        let season: string | null = typeof row["시즌"] === "string" ? (row["시즌"] as string) : null;
        if (row["날짜"] && row["상대팀"]) {
          const { data: game } = await supabase
            .from("games")
            .select("id, season")
            .eq("date", row["날짜"] as string)
            .eq("opponent", row["상대팀"] as string)
            .single();
          if (game) {
            gameId = game.id;
            season = game.season || season;
          }
        }
        await supabase.from("pitching_stats").insert({ player_id: player.id, game_id: gameId, season, w: Number(row["승"]) || 0, l: Number(row["패"]) || 0, sv: Number(row["세"]) || 0, hld: Number(row["홀"]) || 0, ip: Number(row["이닝"]) || 0, ha: Number(row["피안타"]) || 0, runs_allowed: Number(row["실점"]) || 0, er: Number(row["자책"]) || 0, bb: Number(row["볼넷"]) || 0, hbp: Number(row["사구"]) || 0, so: Number(row["삼진"]) || 0, hr_allowed: Number(row["피홈런"]) || 0 });
        results.pitching++;
      }
    }

    return NextResponse.json({ success: true, message: `업로드 완료! 경기 ${results.games}개, 타자 ${results.batting}명, 투수 ${results.pitching}명 추가`, details: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
