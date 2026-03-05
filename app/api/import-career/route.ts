export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const results = {
      players: 0,
      batting: 0,
      pitching: 0,
      skipped_batting: 0,
      skipped_pitching: 0,
      seasons: [] as string[],
      errors: [] as string[],
    };

    const yearSheets = workbook.SheetNames.filter((name) => /^\d{4}$/.test(name) || name === "Career Totals");

    for (const sheetName of yearSheets) {
      const ws = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      const season = sheetName === "Career Totals" ? "Career" : sheetName;
      results.seasons.push(season);

      let battingHeaderRow = -1;
      let pitchingHeaderRow = -1;

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (row && row[0] === "배번" && row[3] === "타석") battingHeaderRow = i;
        if (row && row[0] === "배번" && row[3] === "승") pitchingHeaderRow = i;
      }

      // 타자 기록
      if (battingHeaderRow >= 0) {
        const endRow = pitchingHeaderRow >= 0 ? pitchingHeaderRow : allRows.length;
        for (let i = battingHeaderRow + 1; i < endRow; i++) {
          const row = allRows[i];
          if (!row || !row[0] || !row[1]) continue;
          if (row[0] === "통산" || typeof row[0] === "string") continue;
          const playerNumber = Number(row[0]);
          const name = String(row[1]);
          if (!playerNumber || !name) continue;

          // 선수 찾기 (배번+이름 또는 이름만으로)
          let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).eq("name", name).single();
          if (!player) {
            const { data: playerByName } = await supabase.from("players").select("id").eq("name", name).single();
            if (playerByName) {
              player = playerByName;
            } else {
              const { data: newPlayer } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: false }).select().single();
              player = newPlayer;
              if (player) results.players++;
            }
          }
          if (!player) continue;

          // 중복 체크: 같은 선수 + 같은 시즌 + 같은 타수
          const pa = Number(row[3]) || 0;
          const ab = Number(row[4]) || 0;
          const hits = Number(row[6]) || 0;
          if (pa === 0 && ab === 0) continue;

          const { data: existing } = await supabase
            .from("batting_stats")
            .select("id, pa, ab, hits")
            .eq("player_id", player.id)
            .eq("season", season);

          if (existing && existing.length > 0) {
            // 완전히 동일한 데이터인지 확인
            const isDuplicate = existing.some(
              (e: any) => e.pa === pa && e.ab === ab && e.hits === hits
            );
            if (isDuplicate) {
              results.skipped_batting++;
              continue;
            }
          }

          await supabase.from("batting_stats").insert({
            player_id: player.id, season, pa, ab,
            runs: Number(row[5]) || 0, hits,
            doubles: Number(row[7]) || 0, triples: Number(row[8]) || 0,
            hr: Number(row[9]) || 0, rbi: Number(row[10]) || 0,
            bb: Number(row[11]) || 0, hbp: Number(row[12]) || 0,
            so: Number(row[13]) || 0, sb: Number(row[14]) || 0,
          });
          results.batting++;
        }
      }

      // 투수 기록
      if (pitchingHeaderRow >= 0) {
        for (let i = pitchingHeaderRow + 1; i < allRows.length; i++) {
          const row = allRows[i];
          if (!row || !row[0] || !row[1]) continue;
          if (row[0] === "통산" || typeof row[0] === "string") continue;
          const playerNumber = Number(row[0]);
          const name = String(row[1]);
          if (!playerNumber || !name) continue;

          let { data: player } = await supabase.from("players").select("id").eq("number", playerNumber).eq("name", name).single();
          if (!player) {
            const { data: playerByName } = await supabase.from("players").select("id").eq("name", name).single();
            if (playerByName) {
              player = playerByName;
              await supabase.from("players").update({ is_pitcher: true }).eq("id", player.id);
            } else {
              const { data: newPlayer } = await supabase.from("players").insert({ number: playerNumber, name, is_pitcher: true }).select().single();
              player = newPlayer;
              if (player) results.players++;
            }
          }
          if (!player) continue;

          const ip = Number(row[7]) || 0;
          const er = Number(row[10]) || 0;
          const so = Number(row[13]) || 0;
          if (ip === 0) continue;

          // 중복 체크: 같은 선수 + 같은 시즌 + 같은 이닝/자책
          const { data: existing } = await supabase
            .from("pitching_stats")
            .select("id, ip, er, so")
            .eq("player_id", player.id)
            .eq("season", season);

          if (existing && existing.length > 0) {
            const isDuplicate = existing.some(
              (e: any) => parseFloat(e.ip) === ip && e.er === er && e.so === so
            );
            if (isDuplicate) {
              results.skipped_pitching++;
              continue;
            }
          }

          await supabase.from("pitching_stats").insert({
            player_id: player.id, season,
            w: Number(row[3]) || 0, l: Number(row[4]) || 0,
            sv: Number(row[5]) || 0, hld: Number(row[6]) || 0,
            ip, ha: Number(row[8]) || 0,
            runs_allowed: Number(row[9]) || 0, er,
            bb: Number(row[11]) || 0, hbp: Number(row[12]) || 0,
            so, hr_allowed: Number(row[14]) || 0,
          });
          results.pitching++;
        }
      }
    }

    const skippedMsg =
      results.skipped_batting + results.skipped_pitching > 0
        ? ` (중복 건너뜀: 타자 ${results.skipped_batting}건, 투수 ${results.skipped_pitching}건)`
        : "";

    return NextResponse.json({
      success: true,
      message: `임포트 완료! 신규 선수 ${results.players}명, 타자 ${results.batting}건, 투수 ${results.pitching}건 추가${skippedMsg}`,
      details: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    console.error("임포트 에러:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}