export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  COLUMN_ALIASES,
  type SpreadsheetRow,
  extractSeasonFromSheetName,
  findColumnIndex,
  hasColumn,
  rowHasAnyColumn,
} from "@/lib/spreadsheetImport";
import { sanitizeImportedPlayerName } from "@/lib/playerNameValidation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = SpreadsheetRow;

function detectHeaderRows(rows: Row[]) {
  const battingHeaderRow = rows.findIndex(
    (row) => hasColumn(row, COLUMN_ALIASES.name) && rowHasAnyColumn(row, [COLUMN_ALIASES.pa, COLUMN_ALIASES.ab, COLUMN_ALIASES.hits])
  );
  const pitchingHeaderRow = rows.findIndex(
    (row) => hasColumn(row, COLUMN_ALIASES.name) && rowHasAnyColumn(row, [COLUMN_ALIASES.w, COLUMN_ALIASES.ip, COLUMN_ALIASES.er])
  );

  return { battingHeaderRow, pitchingHeaderRow };
}

function detectColumns(headerRow: Row) {
  return {
    number: findColumnIndex(headerRow, COLUMN_ALIASES.number),
    name: findColumnIndex(headerRow, COLUMN_ALIASES.name),
    pa: findColumnIndex(headerRow, COLUMN_ALIASES.pa),
    ab: findColumnIndex(headerRow, COLUMN_ALIASES.ab),
    runs: findColumnIndex(headerRow, COLUMN_ALIASES.runs),
    hits: findColumnIndex(headerRow, COLUMN_ALIASES.hits),
    doubles: findColumnIndex(headerRow, COLUMN_ALIASES.doubles),
    triples: findColumnIndex(headerRow, COLUMN_ALIASES.triples),
    hr: findColumnIndex(headerRow, COLUMN_ALIASES.hr),
    rbi: findColumnIndex(headerRow, COLUMN_ALIASES.rbi),
    battingBb: findColumnIndex(headerRow, COLUMN_ALIASES.battingBb),
    pitchingBb: findColumnIndex(headerRow, COLUMN_ALIASES.pitchingBb),
    hbp: findColumnIndex(headerRow, COLUMN_ALIASES.hbp),
    so: findColumnIndex(headerRow, COLUMN_ALIASES.so),
    sb: findColumnIndex(headerRow, COLUMN_ALIASES.sb),
    w: findColumnIndex(headerRow, COLUMN_ALIASES.w),
    l: findColumnIndex(headerRow, COLUMN_ALIASES.l),
    sv: findColumnIndex(headerRow, COLUMN_ALIASES.sv),
    hld: findColumnIndex(headerRow, COLUMN_ALIASES.hld),
    ip: findColumnIndex(headerRow, COLUMN_ALIASES.ip),
    ha: findColumnIndex(headerRow, COLUMN_ALIASES.ha),
    runsAllowed: findColumnIndex(headerRow, COLUMN_ALIASES.runsAllowed),
    er: findColumnIndex(headerRow, COLUMN_ALIASES.er),
    hrAllowed: findColumnIndex(headerRow, COLUMN_ALIASES.hrAllowed),
  };
}

let syntheticNumberCursor: number | null = null;

async function getNextSyntheticPlayerNumber() {
  if (syntheticNumberCursor !== null) {
    syntheticNumberCursor += 1;
    return syntheticNumberCursor;
  }

  const { data } = await supabase
    .from("players")
    .select("number")
    .gte("number", 900)
    .order("number", { ascending: false })
    .limit(1);

  syntheticNumberCursor = (data?.[0]?.number ?? 899) + 1;
  return syntheticNumberCursor;
}

async function getOrCreatePlayer(
  rawNumber: unknown,
  rawName: unknown,
  isPitcher: boolean,
  results: { players: number }
) {
  const name = sanitizeImportedPlayerName(rawName);
  if (!name) return null;

  const numericValue = Number(rawNumber);
  const playerNumber = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;

  let player = null as { id: string } | null;

  if (playerNumber) {
    const { data: byNumberAndName } = await supabase
      .from("players")
      .select("id")
      .eq("number", playerNumber)
      .eq("name", name)
      .maybeSingle();

    player = byNumberAndName;
  }

  if (!player && playerNumber) {
    const { data: byNumber } = await supabase
      .from("players")
      .select("id")
      .eq("number", playerNumber)
      .maybeSingle();

    player = byNumber;
  }

  if (!player) {
    const { data: byName } = await supabase
      .from("players")
      .select("id,is_pitcher")
      .eq("name", name)
      .maybeSingle();

    player = byName ? { id: byName.id } : null;
    if (byName && isPitcher && !byName.is_pitcher) {
      await supabase.from("players").update({ is_pitcher: true }).eq("id", byName.id);
    }
  }

  if (player) return player;

  const insertNumber = playerNumber ?? await getNextSyntheticPlayerNumber();
  const { data: created } = await supabase
    .from("players")
    .insert({ number: insertNumber, name, is_pitcher: isPitcher })
    .select("id")
    .single();

  if (created) results.players += 1;
  return created;
}

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

    const seasonSheets = workbook.SheetNames.filter((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return false;

      const season = extractSeasonFromSheetName(sheetName);
      if (!season) return false;

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
      const headers = detectHeaderRows(rows);
      return headers.battingHeaderRow >= 0 || headers.pitchingHeaderRow >= 0;
    });

    for (const sheetName of seasonSheets) {
      const ws = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as Row[];
      const season = extractSeasonFromSheetName(sheetName) || sheetName;
      results.seasons.push(season);

      const { battingHeaderRow, pitchingHeaderRow } = detectHeaderRows(allRows);

      if (battingHeaderRow >= 0) {
        const cols = detectColumns(allRows[battingHeaderRow]);
        const endRow = pitchingHeaderRow >= 0 ? pitchingHeaderRow : allRows.length;

        for (let index = battingHeaderRow + 1; index < endRow; index += 1) {
          const row = allRows[index];
          const name = sanitizeImportedPlayerName(cols.name !== -1 ? row[cols.name] : "");
          if (!name) continue;

          const player = await getOrCreatePlayer(cols.number !== -1 ? row[cols.number] : null, name, false, results);
          if (!player) continue;

          const pa = Number(row[cols.pa]) || 0;
          const ab = Number(row[cols.ab]) || 0;
          const hits = Number(row[cols.hits]) || 0;
          if (pa === 0 && ab === 0) continue;

          const { data: existing } = await supabase
            .from("batting_stats")
            .select("id, pa, ab, hits")
            .eq("player_id", player.id)
            .eq("season", season);

          if (existing && existing.some((entry) => entry.pa === pa && entry.ab === ab && entry.hits === hits)) {
            results.skipped_batting += 1;
            continue;
          }

          await supabase.from("batting_stats").insert({
            player_id: player.id,
            season,
            pa,
            ab,
            runs: Number(row[cols.runs]) || 0,
            hits,
            doubles: Number(row[cols.doubles]) || 0,
            triples: Number(row[cols.triples]) || 0,
            hr: Number(row[cols.hr]) || 0,
            rbi: Number(row[cols.rbi]) || 0,
            bb: Number(row[cols.battingBb]) || 0,
            hbp: Number(row[cols.hbp]) || 0,
            so: Number(row[cols.so]) || 0,
            sb: Number(row[cols.sb]) || 0,
          });
          results.batting += 1;
        }
      }

      if (pitchingHeaderRow >= 0) {
        const cols = detectColumns(allRows[pitchingHeaderRow]);

        for (let index = pitchingHeaderRow + 1; index < allRows.length; index += 1) {
          const row = allRows[index];
          const name = sanitizeImportedPlayerName(cols.name !== -1 ? row[cols.name] : "");
          if (!name) continue;

          const player = await getOrCreatePlayer(cols.number !== -1 ? row[cols.number] : null, name, true, results);
          if (!player) continue;

          const ip = Number(row[cols.ip]) || 0;
          const er = Number(row[cols.er]) || 0;
          const so = Number(row[cols.so]) || 0;
          if (ip === 0) continue;

          const { data: existing } = await supabase
            .from("pitching_stats")
            .select("id, ip, er, so")
            .eq("player_id", player.id)
            .eq("season", season);

          if (
            existing &&
            existing.some((entry) => parseFloat(String(entry.ip)) === ip && entry.er === er && entry.so === so)
          ) {
            results.skipped_pitching += 1;
            continue;
          }

          await supabase.from("pitching_stats").insert({
            player_id: player.id,
            season,
            w: Number(row[cols.w]) || 0,
            l: Number(row[cols.l]) || 0,
            sv: Number(row[cols.sv]) || 0,
            hld: Number(row[cols.hld]) || 0,
            ip,
            ha: Number(row[cols.ha]) || 0,
            runs_allowed: Number(row[cols.runsAllowed]) || 0,
            er,
            bb: Number(row[cols.pitchingBb]) || 0,
            hbp: Number(row[cols.hbp]) || 0,
            so,
            hr_allowed: Number(row[cols.hrAllowed]) || 0,
          });
          results.pitching += 1;
        }
      }
    }

    const skippedMsg =
      results.skipped_batting + results.skipped_pitching > 0
        ? ` (중복 건너뜀: 타자 ${results.skipped_batting}건, 투수 ${results.skipped_pitching}건)`
        : "";

    ["/", "/players", "/compare", "/team-analysis", "/upload", "/import"].forEach((path) => revalidatePath(path));
    revalidatePath("/", "layout");

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
