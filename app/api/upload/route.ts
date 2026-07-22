export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  findOfficialGameSheet,
  isOfficialLiveGameWorkbook,
  parseOfficialGameBattingSheet,
  parseOfficialGameHighlights,
  parseOfficialGamePitchingSheet,
} from "@/lib/officialGameWorkbook";
import { parseGameLines } from "@/lib/parseDocxGameRecord";
import { inferRosterSnapshotSeasons } from "@/lib/rosterSnapshot";
import { sanitizeImportedPlayerName } from "@/lib/playerNameValidation";
import { ACTIVE_SEASON_COOKIE, getLatestSeason } from "@/lib/season";
import { ensureSeasonActivated } from "@/lib/seasonVisibility";
import { extractGameMetaFromFilename, extractSeasonFromFilename } from "@/lib/gameFileMeta";
import {
  COLUMN_ALIASES,
  type SpreadsheetRow,
  detectPlayerStatKind,
  extractSeasonFromSheetName,
  findColumnIndex,
  findHeaderRowIndex,
  findSheetNameByAliases,
  getStructuredSheetNames,
  hasColumn,
  matchesAlias,
  normalizeSpreadsheetDateValue,
  rowHasAnyColumn,
  SHEET_ALIASES,
} from "@/lib/spreadsheetImport";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TARGET_SEASON = "2026";
const ACTIVE_PLAYER_COLOR = "EA9999";

type Row = SpreadsheetRow;

type RosterPlayer = {
  number: number;
  name: string;
  position?: string;
  is_pitcher?: boolean;
};

type ConflictPlayer = RosterPlayer & {
  existingId: string;
  existingName: string;
  existingNumber: number;
};

type PlayerRecord = {
  id: string;
  name: string;
  number: number;
  is_pitcher?: boolean | null;
};

type UploadResults = {
  players: number;
  updated: number;
  games: number;
  batting: number;
  pitching: number;
  skipped_batting: number;
  skipped_pitching: number;
  seasons: string[];
};

function normalizeSeason(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function uniqueSeasons(values: Array<string | number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeSeason(value))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function normalizeDateValue(value: unknown, fallbackSeason = TARGET_SEASON): string | null {
  return normalizeSpreadsheetDateValue(value, fallbackSeason);
}

let syntheticNumberCursor: number | null = null;

function isStatSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  return rows.slice(0, 8).some((row) =>
    rowHasAnyColumn(row, [
      COLUMN_ALIASES.date,
      COLUMN_ALIASES.opponent,
      COLUMN_ALIASES.pa,
      COLUMN_ALIASES.ab,
      COLUMN_ALIASES.ip,
      COLUMN_ALIASES.w,
    ])
  );
}

function hasPlayerIdentityColumns(row: Row) {
  return hasColumn(row, COLUMN_ALIASES.number) && hasColumn(row, COLUMN_ALIASES.name);
}

function isSeasonTotalSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];

  return detectHeaderRows(rows).battingHeaderRow >= 0 || detectHeaderRows(rows).pitchingHeaderRow >= 0;
}

function describeDetailedBlockSheet(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstCell = String(row?.[0] ?? "").trim();
    if (!/^\d+\.\s*.+$/.test(firstCell)) continue;

    for (let headerIndex = index + 1; headerIndex < Math.min(rows.length, index + 4); headerIndex += 1) {
      const headerRow = rows[headerIndex] ?? [];
      if (!hasColumn(headerRow, COLUMN_ALIASES.date) || !hasColumn(headerRow, COLUMN_ALIASES.opponent)) continue;

      const kind = detectPlayerStatKind("", headerRow);
      if (kind) {
        return { isMatch: true, kind };
      }
    }
  }

  return { isMatch: false, kind: null as "batting" | "pitching" | null };
}

function isDetailedBlockSheet(sheet: XLSX.WorkSheet): boolean {
  return describeDetailedBlockSheet(sheet).isMatch;
}

function extractRosterPlayers(workbook: XLSX.WorkBook): RosterPlayer[] {
  const sheetName =
    findSheetNameByAliases(workbook.SheetNames, SHEET_ALIASES.roster) || workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  if (rows.length === 0) return [];

  const headerRowIndex = findHeaderRowIndex(rows, [COLUMN_ALIASES.number, COLUMN_ALIASES.name], 10);
  const roster = new Map<string, RosterPlayer>();

  if (headerRowIndex >= 0) {
    const headerRow = rows[headerRowIndex];
    const numCol = findColumnIndex(headerRow, COLUMN_ALIASES.number);
    const nameCol = findColumnIndex(headerRow, COLUMN_ALIASES.name);

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const number = Number(row[numCol]);
      const name = sanitizeImportedPlayerName(row[nameCol]);
      if (!number || !name) continue;
      roster.set(`${number}:${name}`, { number, name });
    }

    return Array.from(roster.values()).sort((a, b) => a.number - b.number);
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (const base of [0, 2, 4, 6]) {
      const number = Number(row?.[base]);
      const name = sanitizeImportedPlayerName(row?.[base + 1]);
      if (!number || !name) continue;

      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: base + 1 });
      const cell = sheet[cellRef];
      const color = cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || "";

      if (color === ACTIVE_PLAYER_COLOR) {
        roster.set(`${number}:${name}`, { number, name });
      }
    }
  }

  return Array.from(roster.values()).sort((a, b) => a.number - b.number);
}

function collectStructuredStatSeasons(workbook: XLSX.WorkBook): string[] {
  const seasons = new Set<string>();
  const structuredSheets = getStructuredSheetNames(workbook);

  for (const sheetName of Object.values(structuredSheets)) {
    if (!sheetName) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
    const headerRowIndex = findHeaderRowIndex(rows, [COLUMN_ALIASES.season], 8);
    if (headerRowIndex === -1) continue;

    const seasonCol = findColumnIndex(rows[headerRowIndex], COLUMN_ALIASES.season);
    if (seasonCol === -1) continue;

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const season = normalizeSeason(rows[rowIndex]?.[seasonCol]);
      if (season) seasons.add(season);
    }
  }

  return Array.from(seasons);
}

function collectFlexibleStatSeasons(
  workbook: XLSX.WorkBook,
  fileName: string,
  fallbackSeason: string
): string[] {
  const structured = collectStructuredStatSeasons(workbook);
  if (structured.length > 0) return structured;

  if (isOfficialLiveGameWorkbook(workbook)) {
    return [extractSeasonFromFilename(fileName, fallbackSeason)];
  }

  const seasons = new Set<string>();
  const yearSheets = workbook.SheetNames.filter((sheetName) =>
    Boolean(extractSeasonFromSheetName(sheetName))
  );

  if (yearSheets.length > 0) {
    yearSheets.forEach((sheetName) => {
      const season = extractSeasonFromSheetName(sheetName);
      if (season) seasons.add(season);
    });
    return Array.from(seasons);
  }

  for (const sheetName of workbook.SheetNames) {
    const season = extractSeasonFromSheetName(sheetName);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    if ((isSeasonTotalSheet(sheet) || isDetailedBlockSheet(sheet)) && season) {
      seasons.add(season);
    }
  }

  if (seasons.size === 0) {
    const fromFileName = extractSeasonFromFilename(fileName, fallbackSeason);
    if (fromFileName) seasons.add(fromFileName);
  }

  return Array.from(seasons);
}

function getSeasonTotalTargets(workbook: XLSX.WorkBook, fileName: string, fallbackSeason: string) {
  const targets: { sheetName: string; season: string }[] = [];
  const yearSheets = workbook.SheetNames.filter((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return Boolean(sheet && extractSeasonFromSheetName(sheetName) && isSeasonTotalSheet(sheet));
  });

  if (yearSheets.length > 0) {
    return yearSheets
      .map((sheetName) => ({ sheetName, season: extractSeasonFromSheetName(sheetName) }))
      .filter((target): target is { sheetName: string; season: string } => Boolean(target.season));
  }

  const defaultSeason = extractSeasonFromFilename(fileName, fallbackSeason);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !isSeasonTotalSheet(sheet)) continue;

    targets.push({
      sheetName,
      season: extractSeasonFromSheetName(sheetName) || defaultSeason,
    });
  }

  return targets;
}

function getDetailedBlockTargets(workbook: XLSX.WorkBook, fileName: string, fallbackSeason: string) {
  const defaultSeason = extractSeasonFromFilename(fileName, fallbackSeason);

  return workbook.SheetNames
    .flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return [];

      const descriptor = describeDetailedBlockSheet(sheet);
      if (!descriptor.isMatch || !descriptor.kind) return [];

      return [{
        sheetName,
        season: extractSeasonFromSheetName(sheetName) || defaultSeason,
        kind: descriptor.kind,
      }];
    });
}

async function clearSeasonSnapshot(seasons: string[]) {
  if (seasons.length === 0) return;

  await supabase.from("batting_stats").delete().in("season", seasons);
  await supabase.from("pitching_stats").delete().in("season", seasons);
  await supabase.from("games").delete().in("season", seasons);
}

function revalidateConnectedViews() {
  ["/", "/lineup", "/schedule", "/compare", "/team-analysis", "/game-review", "/upload"].forEach((path) =>
    revalidatePath(path)
  );
  revalidatePath("/", "layout");
}

function withActiveSeasonCookie(response: NextResponse, season: string) {
  response.cookies.set(ACTIVE_SEASON_COOKIE, season, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

async function activateEligibleSeasons(seasons: string[], fileName: string, results: UploadResults) {
  if (results.games === 0 && results.batting === 0 && results.pitching === 0) return [];

  const activated: string[] = [];
  for (const season of seasons) {
    if (await ensureSeasonActivated(supabase, season, fileName)) {
      activated.push(season);
    }
  }
  return activated;
}

async function activateUploadedSeasons(seasons: string[], fileName: string) {
  const activated: string[] = [];
  for (const season of seasons) {
    if (await ensureSeasonActivated(supabase, season, fileName)) {
      activated.push(season);
    }
  }
  return activated;
}

async function saveUploadRecord(
  filename: string,
  players: { number: number; name: string }[],
  addedCount: number,
  updatedCount: number,
  source: "file" | "manual",
  seasons: string[] = [TARGET_SEASON]
) {
  try {
    const snapshotSeasons = uniqueSeasons(seasons);
    await supabase.from("roster_uploads").insert({
      filename,
      player_count: players.length,
      added_count: addedCount,
      updated_count: updatedCount,
      source,
      players_snapshot: JSON.stringify({
        seasons: snapshotSeasons,
        players,
      }),
      uploaded_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("roster_uploads 기록 저장 실패:", error);
  }
}

async function detectConflicts(rosterPlayers: RosterPlayer[]): Promise<ConflictPlayer[]> {
  const { data: existing } = await supabase.from("players").select("id,name,number");
  if (!existing) return [];

  const conflicts: ConflictPlayer[] = [];
  for (const player of rosterPlayers) {
    const byNumber = existing.find((entry) => entry.number === player.number);
    const byName = existing.find((entry) => entry.name === player.name);
    const match = byNumber || byName;
    if (!match) continue;

    conflicts.push({
      ...player,
      existingId: match.id,
      existingName: match.name,
      existingNumber: match.number,
    });
  }

  return conflicts;
}

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

async function findPlayerByNumberOrName(playerNumber: number | null, name: string) {
  if (playerNumber && playerNumber > 0) {
    const { data: playersByNumber } = await supabase
      .from("players")
      .select("id,name,number,is_pitcher")
      .eq("number", playerNumber)
      .limit(5);

    const exactByNumber = playersByNumber?.find((player) => player.number === playerNumber) || null;
    if (exactByNumber) return exactByNumber as PlayerRecord;
  }

  const { data: playersByName } = await supabase
    .from("players")
    .select("id,name,number,is_pitcher")
    .eq("name", name)
    .limit(5);

  return (playersByName?.[0] as PlayerRecord | undefined) || null;
}

async function upsertPlayer(
  playerNumber: number | null,
  rawName: string,
  isPitcher: boolean,
  results?: UploadResults
) {
  const name = sanitizeImportedPlayerName(rawName);
  if (!name) {
    console.warn("유효하지 않은 선수명을 건너뜁니다:", rawName);
    return null;
  }

  const normalizedNumber = playerNumber && playerNumber > 0 ? playerNumber : null;
  let player = await findPlayerByNumberOrName(normalizedNumber, name);

  if (!player) {
    const insertNumber = normalizedNumber ?? await getNextSyntheticPlayerNumber();
    const { data: created } = await supabase
      .from("players")
      .insert({
        number: insertNumber,
        name,
        is_pitcher: isPitcher,
      })
      .select("id,name,number,is_pitcher")
      .single();

    if (created && results) results.players += 1;
    return (created as PlayerRecord | null) || null;
  }

  const updates: Record<string, unknown> = {};
  if (player.name !== name) updates.name = name;
  if (normalizedNumber && player.number !== normalizedNumber) updates.number = normalizedNumber;
  if (isPitcher && !player.is_pitcher) updates.is_pitcher = true;

  if (Object.keys(updates).length > 0) {
    await supabase.from("players").update(updates).eq("id", player.id);
    if (results) results.updated += 1;
    player = { ...player, ...updates } as PlayerRecord;
  }

  return player;
}

async function initializeRosterSeasons(
  rosterPlayers: RosterPlayer[],
  overwrite: boolean,
  seasons: string[]
) {
  const targetSeasons = uniqueSeasons(seasons);
  const results = {
    players: 0,
    updated: 0,
    batting: 0,
    pitching: 0,
    skipped_batting: 0,
    skipped_pitching: 0,
  };

  for (const rosterPlayer of rosterPlayers) {
    let playerId: string | null = null;

    const { data: byNumber } = await supabase
      .from("players")
      .select("id,name,number")
      .eq("number", rosterPlayer.number)
      .maybeSingle();

    const { data: byName } = await supabase
      .from("players")
      .select("id,name,number")
      .eq("name", rosterPlayer.name)
      .maybeSingle();

    const existing = byNumber || byName;

    if (existing) {
      playerId = existing.id;
      if (overwrite) {
        const updates: Record<string, unknown> = {};
        if (existing.name !== rosterPlayer.name) updates.name = rosterPlayer.name;
        if (existing.number !== rosterPlayer.number) updates.number = rosterPlayer.number;

        if (Object.keys(updates).length > 0) {
          await supabase.from("players").update(updates).eq("id", existing.id);
          results.updated++;
        }
      }
    } else {
      const { data: created } = await supabase
        .from("players")
        .insert({
          number: rosterPlayer.number,
          name: rosterPlayer.name,
          is_pitcher: rosterPlayer.is_pitcher ?? false,
        })
        .select("id")
        .single();

      if (created) {
        playerId = created.id;
        results.players++;
      }
    }

    if (!playerId) continue;

    for (const season of targetSeasons) {
      const { data: existingBatting } = await supabase
        .from("batting_stats")
        .select("id")
        .eq("player_id", playerId)
        .eq("season", season)
        .limit(1);

      if (!existingBatting || existingBatting.length === 0) {
        await supabase.from("batting_stats").insert({
          player_id: playerId,
          season,
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

      const { data: existingPitching } = await supabase
        .from("pitching_stats")
        .select("id")
        .eq("player_id", playerId)
        .eq("season", season)
        .limit(1);

      if (!existingPitching || existingPitching.length === 0) {
        await supabase.from("pitching_stats").insert({
          player_id: playerId,
          season,
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
  }

  return results;
}

function detectHeaderRows(rows: Row[]) {
  const battingHeaderRow = rows.findIndex(
    (row) => hasPlayerIdentityColumns(row) && rowHasAnyColumn(row, [COLUMN_ALIASES.pa, COLUMN_ALIASES.ab, COLUMN_ALIASES.hits])
  );
  const pitchingHeaderRow = rows.findIndex(
    (row) => hasPlayerIdentityColumns(row) && rowHasAnyColumn(row, [COLUMN_ALIASES.w, COLUMN_ALIASES.ip, COLUMN_ALIASES.er])
  );

  return {
    battingHeaderRow,
    pitchingHeaderRow,
  };
}

function detectColumns(headerRow: Row) {
  return {
    season: findColumnIndex(headerRow, COLUMN_ALIASES.season),
    date: findColumnIndex(headerRow, COLUMN_ALIASES.date),
    opponent: findColumnIndex(headerRow, COLUMN_ALIASES.opponent),
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

async function processSeasonTotalSheet(
  sheet: XLSX.WorkSheet,
  season: string,
  results: UploadResults
) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  const { battingHeaderRow, pitchingHeaderRow } = detectHeaderRows(rows);

  if (battingHeaderRow >= 0) {
    const cols = detectColumns(rows[battingHeaderRow]);
    const endRow = pitchingHeaderRow >= 0 ? pitchingHeaderRow : rows.length;

    for (let index = battingHeaderRow + 1; index < endRow; index += 1) {
      const row = rows[index];
      const playerNumber = Number(row[cols.number]);
      const name = String(row[cols.name] ?? "").trim();

      if (!playerNumber || !name || name === "통산") continue;

      const player = await upsertPlayer(playerNumber, name, false, results);
      if (!player) continue;

      await supabase.from("batting_stats").insert({
        player_id: player.id,
        season,
        pa: Number(row[cols.pa]) || 0,
        ab: Number(row[cols.ab]) || 0,
        runs: Number(row[cols.runs]) || 0,
        hits: Number(row[cols.hits]) || 0,
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
    const cols = detectColumns(rows[pitchingHeaderRow]);

    for (let index = pitchingHeaderRow + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const playerNumber = Number(row[cols.number]);
      const name = String(row[cols.name] ?? "").trim();

      if (!playerNumber || !name || name === "통산") continue;

      const player = await upsertPlayer(playerNumber, name, true, results);
      if (!player) continue;

      await supabase.from("pitching_stats").insert({
        player_id: player.id,
        season,
        w: Number(row[cols.w]) || 0,
        l: Number(row[cols.l]) || 0,
        sv: Number(row[cols.sv]) || 0,
        hld: Number(row[cols.hld]) || 0,
        ip: Number(row[cols.ip]) || 0,
        ha: Number(row[cols.ha]) || 0,
        runs_allowed: Number(row[cols.runsAllowed]) || 0,
        er: Number(row[cols.er]) || 0,
        bb: Number(row[cols.pitchingBb]) || 0,
        hbp: Number(row[cols.hbp]) || 0,
        so: Number(row[cols.so]) || 0,
        hr_allowed: Number(row[cols.hrAllowed]) || 0,
      });
      results.pitching += 1;
    }
  }
}

async function getOrCreateGameId(
  date: string,
  opponent: string,
  season: string,
  cache: Map<string, number>,
  results: UploadResults
) {
  const key = `${season}|${date}|${opponent}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const { data: existing } = await supabase
    .from("games")
    .select("id")
    .eq("season", season)
    .eq("date", date)
    .eq("opponent", opponent)
    .maybeSingle();

  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const { data: created } = await supabase
    .from("games")
    .insert({ season, date, opponent })
    .select("id")
    .single();

  if (created) {
    cache.set(key, created.id);
    results.games += 1;
    return created.id;
  }

  return null;
}

async function clearGameSnapshot(gameId: number | null) {
  if (!gameId) return;
  await supabase.from("batting_stats").delete().eq("game_id", gameId);
  await supabase.from("pitching_stats").delete().eq("game_id", gameId);
}

async function upsertGameMetadata(
  gameId: number | null,
  patch: {
    result?: "W" | "L" | "D" | null;
    score_us?: number | null;
    score_them?: number | null;
    notes?: string | null;
  }
) {
  if (!gameId) return;
  const updates = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(updates).length === 0) return;
  await supabase.from("games").update(updates).eq("id", gameId);
}

async function processLiveGameWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  fallbackSeason: string,
  results: UploadResults
) {
  const meta = extractGameMetaFromFilename(fileName, fallbackSeason);
  if (!meta.date || !meta.opponent) {
    throw new Error("현장 경기 파일은 파일명에 날짜와 상대팀이 포함되어야 합니다. 예: 9_26 VS 선학 경기 기록.xlsx");
  }

  const battingSheet = findOfficialGameSheet(workbook, "batting");
  const pitchingSheet = findOfficialGameSheet(workbook, "pitching");
  const highlightsSheet = findOfficialGameSheet(workbook, "highlights");

  const battingRows = battingSheet
    ? parseOfficialGameBattingSheet(battingSheet)
    : [];
  const pitchingRows = pitchingSheet
    ? parseOfficialGamePitchingSheet(pitchingSheet)
    : [];
  const highlights = parseOfficialGameHighlights(highlightsSheet);

  const gameCache = new Map<string, number>();
  const gameId = await getOrCreateGameId(meta.date, meta.opponent, meta.season, gameCache, results);

  await clearGameSnapshot(gameId);

  for (const row of battingRows) {
    const player = await upsertPlayer(null, row.name, row.position === "P", results);
    if (!player || !gameId) continue;

    await supabase.from("batting_stats").insert({
      player_id: player.id,
      game_id: gameId,
      season: meta.season,
      pa: row.pa,
      ab: row.ab,
      runs: row.runs,
      hits: row.hits,
      doubles: row.doubles,
      triples: row.triples,
      hr: row.hr,
      rbi: row.rbi,
      bb: row.bb,
      hbp: row.hbp,
      so: row.so,
      sb: row.sb,
    });
    results.batting += 1;
  }

  for (const row of pitchingRows) {
    const player = await upsertPlayer(null, row.name, true, results);
    if (!player || !gameId) continue;

    await supabase.from("pitching_stats").insert({
      player_id: player.id,
      game_id: gameId,
      season: meta.season,
      w: row.w,
      l: row.l,
      sv: row.sv,
      hld: row.hld,
      ip: row.ip,
      ha: row.ha,
      runs_allowed: row.runs_allowed,
      er: row.er,
      bb: row.bb,
      hbp: row.hbp,
      so: row.so,
      hr_allowed: row.hr_allowed,
    });
    results.pitching += 1;
  }

  const scoreUs = battingRows.reduce((sum, row) => sum + row.runs, 0);
  const scoreThem = pitchingRows.reduce((sum, row) => sum + row.runs_allowed, 0);
  const result =
    scoreUs > scoreThem ? "W" : scoreUs < scoreThem ? "L" : (scoreUs === 0 && scoreThem === 0 ? null : "D");

  await upsertGameMetadata(gameId, {
    score_us: scoreUs,
    score_them: scoreThem,
    result,
    notes: highlights.length > 0 ? highlights.join(" | ") : null,
  });
}

async function processLiveGameDocxFile(
  file: File,
  fileName: string,
  fallbackSeason: string,
  results: UploadResults
) {
  const meta = extractGameMetaFromFilename(fileName, fallbackSeason);
  if (!meta.date || !meta.opponent) {
    throw new Error("현장 경기 Word 파일은 파일명에 날짜와 상대팀이 포함되어야 합니다. 예: Sep 29 VS 사회인.docx");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { value } = await mammoth.extractRawText({ buffer });
  const lines = value.split("\n").filter((line) => line.trim().length > 0);
  const parsed = parseGameLines(lines);

  const gameCache = new Map<string, number>();
  const gameId = await getOrCreateGameId(meta.date, meta.opponent, meta.season, gameCache, results);
  await clearGameSnapshot(gameId);

  for (const row of parsed.battingStats) {
    const player = await upsertPlayer(null, row.name, false, results);
    if (!player || !gameId) continue;

    const ab = Number(row.atBats) || 0;
    const bb = Number(row.walks) || 0;
    const hbp = Number(row.hbp) || 0;

    await supabase.from("batting_stats").insert({
      player_id: player.id,
      game_id: gameId,
      season: meta.season,
      pa: ab + bb + hbp,
      ab,
      runs: Number(row.runs) || 0,
      hits: Number(row.hits) || 0,
      doubles: Number(row.doubles) || 0,
      triples: Number(row.triples) || 0,
      hr: Number(row.homeRuns) || 0,
      rbi: Number(row.rbi) || 0,
      bb,
      hbp,
      so: Number(row.strikeouts) || 0,
      sb: 0,
    });
    results.batting += 1;
  }

  for (const row of parsed.pitchingStats) {
    const player = await upsertPlayer(null, row.name, true, results);
    if (!player || !gameId) continue;

    await supabase.from("pitching_stats").insert({
      player_id: player.id,
      game_id: gameId,
      season: meta.season,
      w: 0,
      l: 0,
      sv: 0,
      hld: 0,
      ip: Number(row.innings) || 0,
      ha: Number(row.hits) || 0,
      runs_allowed: Number(row.runs) || 0,
      er: Number(row.earnedRuns) || Number(row.runs) || 0,
      bb: Number(row.walks) || 0,
      hbp: 0,
      so: Number(row.strikeouts) || 0,
      hr_allowed: 0,
    });
    results.pitching += 1;
  }

  const scoreUs = parsed.gameInfo.score_us || 0;
  const scoreThem = parsed.gameInfo.score_them || 0;
  const result = parsed.gameInfo.result && ["W", "L", "D"].includes(parsed.gameInfo.result)
    ? (parsed.gameInfo.result as "W" | "L" | "D")
    : scoreUs > scoreThem
      ? "W"
      : scoreUs < scoreThem
        ? "L"
        : (scoreUs === 0 && scoreThem === 0 ? null : "D");

  await upsertGameMetadata(gameId, {
    score_us: scoreUs,
    score_them: scoreThem,
    result,
    notes: value.trim() ? value.trim().slice(0, 4000) : null,
  });
}

async function processStructuredWorkbook(
  workbook: XLSX.WorkBook,
  defaultSeason: string,
  results: UploadResults
) {
  const gameCache = new Map<string, number>();
  const structuredSheets = getStructuredSheetNames(workbook);

  if (structuredSheets.games) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[structuredSheets.games], { header: 1, defval: "" }) as Row[];
    const headerRowIndex = findHeaderRowIndex(rows, [COLUMN_ALIASES.date, COLUMN_ALIASES.opponent], 10);

    if (headerRowIndex >= 0) {
      const cols = detectColumns(rows[headerRowIndex]);
      for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
        const row = rows[index];
        const season = normalizeSeason(cols.season !== -1 ? row[cols.season] : null) || defaultSeason;
        const date = cols.date !== -1 ? normalizeDateValue(row[cols.date], season) : null;
        const opponent = String((cols.opponent !== -1 ? row[cols.opponent] : "") ?? "").trim();

        if (!date || !opponent || !season) continue;
        await getOrCreateGameId(date, opponent, season, gameCache, results);
      }
    }
  }

  const processPlayerSheet = async (sheetName: string | null, kind: "batting" | "pitching") => {
    if (!sheetName) return;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
    const headerRowIndex = rows.findIndex(
      (row) =>
        hasColumn(row, COLUMN_ALIASES.name) &&
        rowHasAnyColumn(
          row,
          kind === "pitching"
            ? [COLUMN_ALIASES.w, COLUMN_ALIASES.ip, COLUMN_ALIASES.er]
            : [COLUMN_ALIASES.pa, COLUMN_ALIASES.ab, COLUMN_ALIASES.hits]
        )
    );

    if (headerRowIndex === -1) return;

    const cols = detectColumns(rows[headerRowIndex]);
    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      const playerNumberValue = cols.number !== -1 ? Number(row[cols.number]) : null;
      const playerNumber =
        typeof playerNumberValue === "number" && Number.isFinite(playerNumberValue) && playerNumberValue > 0
          ? playerNumberValue
          : null;
      const name = sanitizeImportedPlayerName(cols.name !== -1 ? row[cols.name] : "");
      if (!name || matchesAlias(name, SHEET_ALIASES.careerTotals)) continue;

      const player = await upsertPlayer(playerNumber, name, kind === "pitching", results);
      if (!player) continue;

      const season = normalizeSeason(cols.season !== -1 ? row[cols.season] : null) || defaultSeason;
      const date = cols.date !== -1 ? normalizeDateValue(row[cols.date], season) : null;
      const opponent = String((cols.opponent !== -1 ? row[cols.opponent] : "") ?? "").trim();
      const gameId =
        date && opponent && season
          ? await getOrCreateGameId(date, opponent, season, gameCache, results)
          : null;

      if (kind === "pitching") {
        await supabase.from("pitching_stats").insert({
          player_id: player.id,
          game_id: gameId,
          season,
          w: Number(row[cols.w]) || 0,
          l: Number(row[cols.l]) || 0,
          sv: Number(row[cols.sv]) || 0,
          hld: Number(row[cols.hld]) || 0,
          ip: Number(row[cols.ip]) || 0,
          ha: Number(row[cols.ha]) || 0,
          runs_allowed: Number(row[cols.runsAllowed]) || 0,
          er: Number(row[cols.er]) || 0,
          bb: Number(row[cols.pitchingBb]) || 0,
          hbp: Number(row[cols.hbp]) || 0,
          so: Number(row[cols.so]) || 0,
          hr_allowed: Number(row[cols.hrAllowed]) || 0,
        });
        results.pitching += 1;
      } else {
        await supabase.from("batting_stats").insert({
          player_id: player.id,
          game_id: gameId,
          season,
          pa: Number(row[cols.pa]) || 0,
          ab: Number(row[cols.ab]) || 0,
          runs: Number(row[cols.runs]) || 0,
          hits: Number(row[cols.hits]) || 0,
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
  };

  await processPlayerSheet(structuredSheets.batting, "batting");
  await processPlayerSheet(structuredSheets.pitching, "pitching");
}

async function processDetailedBlockSheet(
  sheet: XLSX.WorkSheet,
  season: string,
  kind: "batting" | "pitching",
  results: UploadResults,
  gameCache: Map<string, number>
) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  let currentPlayer: { number: number; name: string } | null = null;
  let cols: ReturnType<typeof detectColumns> | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstCell = String(row[0] ?? "").trim();

    const playerHeader = firstCell.match(/^(\d+)\.\s*(.+)$/);
    if (playerHeader) {
      currentPlayer = {
        number: Number(playerHeader[1]),
        name: sanitizeImportedPlayerName(playerHeader[2]),
      };
      cols = null;
      continue;
    }

    if (!currentPlayer) continue;
    if (hasColumn(row, COLUMN_ALIASES.date) && hasColumn(row, COLUMN_ALIASES.opponent)) {
      cols = detectColumns(row);
      continue;
    }

    if (!firstCell || firstCell.includes("시즌")) continue;

    const activeCols = cols || detectColumns(["날짜", "상대팀"]);
    const date = normalizeDateValue(
      activeCols.date !== -1 ? row[activeCols.date] : row[0],
      season
    );
    const opponent = String((activeCols.opponent !== -1 ? row[activeCols.opponent] : row[1]) ?? "").trim();
    if (!date || !opponent || !currentPlayer.name) continue;

    const player = await upsertPlayer(currentPlayer.number, currentPlayer.name, kind === "pitching", results);
    if (!player) continue;

    const gameId = await getOrCreateGameId(date, opponent, season, gameCache, results);

    if (kind === "pitching") {
      await supabase.from("pitching_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        w: Number(row[activeCols.w]) || 0,
        l: Number(row[activeCols.l]) || 0,
        sv: Number(row[activeCols.sv]) || 0,
        hld: Number(row[activeCols.hld]) || 0,
        ip: Number(row[activeCols.ip]) || 0,
        ha: Number(row[activeCols.ha]) || 0,
        runs_allowed: Number(row[activeCols.runsAllowed]) || 0,
        er: Number(row[activeCols.er]) || 0,
        bb: Number(row[activeCols.pitchingBb]) || 0,
        hbp: Number(row[activeCols.hbp]) || 0,
        so: Number(row[activeCols.so]) || 0,
        hr_allowed: Number(row[activeCols.hrAllowed]) || 0,
      });
      results.pitching += 1;
    } else {
      await supabase.from("batting_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        pa: Number(row[activeCols.pa]) || 0,
        ab: Number(row[activeCols.ab]) || 0,
        runs: Number(row[activeCols.runs]) || 0,
        hits: Number(row[activeCols.hits]) || 0,
        doubles: Number(row[activeCols.doubles]) || 0,
        triples: Number(row[activeCols.triples]) || 0,
        hr: Number(row[activeCols.hr]) || 0,
        rbi: Number(row[activeCols.rbi]) || 0,
        bb: Number(row[activeCols.battingBb]) || 0,
        hbp: Number(row[activeCols.hbp]) || 0,
        so: Number(row[activeCols.so]) || 0,
        sb: Number(row[activeCols.sb]) || 0,
      });
      results.batting += 1;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const requestedSeason = normalizeSeason(formData.get("season")) || TARGET_SEASON;

    const manualJson = formData.get("manual") as string | null;
    if (manualJson) {
      const players: RosterPlayer[] = JSON.parse(manualJson);
      const overwrite = formData.get("overwrite") === "true";
      const checkOnly = formData.get("checkOnly") === "true";
      const rosterSeasons = uniqueSeasons([requestedSeason]);
      const conflicts = await detectConflicts(players);

      if (checkOnly) {
        return NextResponse.json({ conflicts, total: players.length });
      }

      if (conflicts.length > 0 && !overwrite) {
        return NextResponse.json({ needsConfirm: true, conflicts, total: players.length });
      }

      const initialized = await initializeRosterSeasons(players, overwrite, rosterSeasons);
      await saveUploadRecord("직접 입력", players, initialized.players, initialized.updated, "manual", rosterSeasons);
      const activatedSeasons = await activateUploadedSeasons(rosterSeasons, "직접 입력");
      revalidateConnectedViews();

      const skipped =
        initialized.skipped_batting > 0 ? ` (기존 기록 ${initialized.skipped_batting}건 유지)` : "";
      const activeSeason = getLatestSeason(rosterSeasons, requestedSeason);

      return withActiveSeasonCookie(NextResponse.json({
        success: true,
        message: `완료! 신규 ${initialized.players}명 추가${initialized.updated > 0 ? `, ${initialized.updated}명 정보 업데이트` : ""}${skipped}${activatedSeasons.length > 0 ? ` · ${activatedSeasons.join(", ")} 시즌 대시보드 활성화` : ""}`,
        details: { ...initialized, seasons: rosterSeasons },
        validation: { processedRows: initialized.batting + initialized.pitching, matchedPlayers: initialized.updated, unmatchedNames: initialized.players },
      }), activeSeason);
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const overwrite = formData.get("overwrite") === "true";
    const checkOnly = formData.get("checkOnly") === "true";
    const skipConflicts = formData.get("skipConflicts") === "true";

    if (/\.docx$/i.test(file.name)) {
      const statSeasons = [extractSeasonFromFilename(file.name, requestedSeason)];
      const results: UploadResults = {
        players: 0,
        updated: 0,
        games: 0,
        batting: 0,
        pitching: 0,
        skipped_batting: 0,
        skipped_pitching: 0,
        seasons: statSeasons,
      };

      await processLiveGameDocxFile(file, file.name, requestedSeason, results);
      const activatedSeasons = await activateEligibleSeasons(statSeasons, file.name, results);
      revalidateConnectedViews();
      const activeSeason = getLatestSeason(statSeasons, requestedSeason);

      return withActiveSeasonCookie(NextResponse.json({
        success: true,
        message: `업로드 완료! 경기 Word 기록을 반영했습니다. 선수 ${results.players}명 추가, 경기 ${results.games}개, 타자 ${results.batting}건, 투수 ${results.pitching}건 반영${activatedSeasons.length > 0 ? ` · ${activatedSeasons.join(", ")} 시즌 잠금 해제` : ""}`,
        details: results,
        validation: { processedRows: results.batting + results.pitching, matchedPlayers: results.updated, unmatchedNames: results.players },
      }), activeSeason);
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
    const structuredSheets = getStructuredSheetNames(workbook);

    const hasStructuredStatSheet =
      Boolean(structuredSheets.games && isStatSheet(workbook.Sheets[structuredSheets.games])) ||
      Boolean(structuredSheets.batting && isStatSheet(workbook.Sheets[structuredSheets.batting])) ||
      Boolean(structuredSheets.pitching && isStatSheet(workbook.Sheets[structuredSheets.pitching]));
    const hasLiveGameStatSheet = isOfficialLiveGameWorkbook(workbook);

    const seasonTotalTargets = getSeasonTotalTargets(workbook, file.name, requestedSeason);
    const detailedBlockTargets = getDetailedBlockTargets(workbook, file.name, requestedSeason);
    const rosterPlayers = extractRosterPlayers(workbook);

    const isStatsUpload =
      hasStructuredStatSheet || hasLiveGameStatSheet || seasonTotalTargets.length > 0 || detailedBlockTargets.length > 0;

    if (!isStatsUpload && rosterPlayers.length > 0) {
      const rosterSeasons = uniqueSeasons([
        ...inferRosterSnapshotSeasons(file.name, "file"),
        requestedSeason,
      ]);
      const conflicts = await detectConflicts(rosterPlayers);

      if (checkOnly) {
        return NextResponse.json({ conflicts, total: rosterPlayers.length });
      }

      if (conflicts.length > 0 && !overwrite && !skipConflicts) {
        return NextResponse.json({ needsConfirm: true, conflicts, total: rosterPlayers.length });
      }

      const playersToProcess = skipConflicts
        ? rosterPlayers.filter(
            (player) =>
              !conflicts.some(
                (conflict) => conflict.name === player.name || conflict.existingNumber === player.number
              )
          )
        : rosterPlayers;

      const initialized = await initializeRosterSeasons(playersToProcess, overwrite, rosterSeasons);
      await saveUploadRecord(file.name, playersToProcess, initialized.players, initialized.updated, "file", rosterSeasons);
      const activatedSeasons = await activateUploadedSeasons(rosterSeasons, file.name);
      revalidateConnectedViews();

      const skipped =
        initialized.skipped_batting > 0 ? ` (기존 기록 ${initialized.skipped_batting}건 유지)` : "";
      const skippedCount =
        skipConflicts && conflicts.length > 0 ? ` · 중복 ${conflicts.length}명 제외` : "";
      const activeSeason = getLatestSeason(rosterSeasons, requestedSeason);

      return withActiveSeasonCookie(NextResponse.json({
        success: true,
        message: `로스터 반영 완료! 신규 ${initialized.players}명 추가${initialized.updated > 0 ? `, ${initialized.updated}명 업데이트` : ""}${skipped}${skippedCount}${activatedSeasons.length > 0 ? ` · ${activatedSeasons.join(", ")} 시즌 대시보드 활성화` : ""}`,
        details: { ...initialized, seasons: rosterSeasons },
        validation: { processedRows: initialized.batting + initialized.pitching, matchedPlayers: initialized.updated, unmatchedNames: initialized.players },
      }), activeSeason);
    }

    const statSeasons = collectFlexibleStatSeasons(workbook, file.name, requestedSeason);
    if (statSeasons.length === 0) {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다. 시즌 통계 또는 로스터 형식의 파일을 업로드해 주세요." },
        { status: 400 }
      );
    }

    const results: UploadResults = {
      players: 0,
      updated: 0,
      games: 0,
      batting: 0,
      pitching: 0,
      skipped_batting: 0,
      skipped_pitching: 0,
      seasons: statSeasons,
    };

    if (hasLiveGameStatSheet) {
      await processLiveGameWorkbook(workbook, file.name, requestedSeason, results);
    } else {
      await clearSeasonSnapshot(statSeasons);
    }

    if (hasStructuredStatSheet) {
      await processStructuredWorkbook(
        workbook,
        extractSeasonFromFilename(file.name, requestedSeason),
        results
      );
    } else if (seasonTotalTargets.length > 0) {
      for (const target of seasonTotalTargets) {
        const sheet = workbook.Sheets[target.sheetName];
        if (!sheet) continue;
        await processSeasonTotalSheet(sheet, target.season, results);
      }
    } else {
      const gameCache = new Map<string, number>();
      for (const target of detailedBlockTargets) {
        const sheet = workbook.Sheets[target.sheetName];
        if (!sheet) continue;
        await processDetailedBlockSheet(sheet, target.season, target.kind, results, gameCache);
      }
    }

    const activatedSeasons = await activateEligibleSeasons(statSeasons, file.name, results);
    revalidateConnectedViews();
    const activeSeason = getLatestSeason(statSeasons, requestedSeason);
    const replacedScope = hasLiveGameStatSheet
      ? "해당 경기 데이터를 최신 파일 기준으로 교체했습니다"
      : `시즌 ${statSeasons.join(", ")} 데이터를 최신 파일 기준으로 교체했습니다`;

    return withActiveSeasonCookie(NextResponse.json({
      success: true,
      message: `업로드 완료! ${replacedScope}. 선수 ${results.players}명 추가, 경기 ${results.games}개, 타자 ${results.batting}건, 투수 ${results.pitching}건 반영${activatedSeasons.length > 0 ? ` · ${activatedSeasons.join(", ")} 시즌 잠금 해제` : ""}`,
      details: results,
      validation: { processedRows: results.batting + results.pitching, matchedPlayers: results.updated, unmatchedNames: results.players },
    }), activeSeason);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
