export const runtime = "nodejs";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ACTIVE_SEASON_COOKIE, getLatestSeason } from "@/lib/season";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TARGET_SEASON = "2026";
const ACTIVE_PLAYER_COLOR = "EA9999";

type Row = unknown[];

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

function normalizeDateValue(value: unknown): string | null {
  if (!value && value !== 0) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const parts = XLSX.SSF.format("yyyy.mm.dd", value).split(".");
    if (parts.length === 3) {
      return `${parts[0]}.${parts[1].padStart(2, "0")}.${parts[2].padStart(2, "0")}`;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!match) return raw;

  return `${match[1]}.${match[2].padStart(2, "0")}.${match[3].padStart(2, "0")}`;
}

function seasonFromSheetName(sheetName: string): string | null {
  const trimmed = sheetName.trim();
  if (/^\d{4}$/.test(trimmed)) return trimmed;

  const shortYear = trimmed.match(/^(\d{2})\s*(Spring|Fall)/i);
  if (shortYear) return `20${shortYear[1]}`;

  const longYear = trimmed.match(/^(\d{4})\s*(Spring|Fall)/i);
  if (longYear) return longYear[1];

  return null;
}

function seasonFromFileName(fileName: string): string | null {
  const match = fileName.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function isStatSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  if (rows.length === 0) return false;
  const headers = rows[0].map((header) => String(header ?? "").trim());
  return ["날짜", "타석", "타수", "이닝", "상대팀"].some((column) => headers.includes(column));
}

function isSeasonTotalSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  for (const row of rows.slice(0, 8)) {
    const headers = row.map((cell) => String(cell ?? "").trim());
    if (headers.includes("배번") && (headers.includes("타석") || headers.includes("승"))) {
      return true;
    }
  }
  return false;
}

function isDetailedBlockSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  if (rows.length < 2) return false;

  const firstCell = String(rows[0]?.[0] ?? "").trim();
  const secondRow = rows[1].map((cell) => String(cell ?? "").trim());

  return /^\d+\.\s*.+$/.test(firstCell) && secondRow.includes("날짜") && secondRow.includes("상대팀");
}

function extractRosterPlayers(workbook: XLSX.WorkBook): RosterPlayer[] {
  const sheetName = workbook.SheetNames.includes("전체") ? "전체" : workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => String(header ?? "").trim());
  const numCol = headers.indexOf("배번");
  const nameCol = headers.indexOf("이름");
  const roster: RosterPlayer[] = [];

  if (numCol !== -1 && nameCol !== -1) {
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const number = Number(row[numCol]);
      const name = String(row[nameCol] ?? "").trim();
      if (!number || !name) continue;
      roster.push({ number, name });
    }
    return roster.sort((a, b) => a.number - b.number);
  }

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (const base of [0, 2, 4, 6]) {
      const number = Number(row?.[base]);
      const name = String(row?.[base + 1] ?? "").trim();
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

function collectStructuredStatSeasons(workbook: XLSX.WorkBook): string[] {
  const seasons = new Set<string>();

  if (workbook.SheetNames.includes("경기")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["경기"]) as Record<string, unknown>[];
    for (const row of rows) {
      const season = normalizeSeason(row["시즌"]);
      if (season) seasons.add(season);
    }
  }

  for (const sheetName of ["타자", "투수"]) {
    if (!workbook.SheetNames.includes(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[];
    for (const row of rows) {
      const season = normalizeSeason(row["시즌"]);
      if (season) seasons.add(season);
    }
  }

  return Array.from(seasons);
}

function collectFlexibleStatSeasons(workbook: XLSX.WorkBook, fileName: string): string[] {
  const structured = collectStructuredStatSeasons(workbook);
  if (structured.length > 0) return structured;

  const seasons = new Set<string>();
  const yearSheets = workbook.SheetNames.filter((sheetName) => /^\d{4}$/.test(sheetName.trim()));

  if (yearSheets.length > 0) {
    yearSheets.forEach((sheetName) => seasons.add(sheetName.trim()));
    return Array.from(seasons);
  }

  for (const sheetName of workbook.SheetNames) {
    const season = seasonFromSheetName(sheetName);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    if ((isSeasonTotalSheet(sheet) || isDetailedBlockSheet(sheet)) && season) {
      seasons.add(season);
    }
  }

  if (seasons.size === 0) {
    const fromFileName = seasonFromFileName(fileName);
    if (fromFileName) seasons.add(fromFileName);
  }

  return Array.from(seasons);
}

function getSeasonTotalTargets(workbook: XLSX.WorkBook, fileName: string) {
  const targets: { sheetName: string; season: string }[] = [];
  const yearSheets = workbook.SheetNames.filter((sheetName) => /^\d{4}$/.test(sheetName.trim()));

  if (yearSheets.length > 0) {
    return yearSheets.map((sheetName) => ({ sheetName, season: sheetName.trim() }));
  }

  const fallbackSeason = seasonFromFileName(fileName) || "2025";

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !isSeasonTotalSheet(sheet)) continue;

    targets.push({
      sheetName,
      season: seasonFromSheetName(sheetName) || fallbackSeason,
    });
  }

  return targets;
}

function getDetailedBlockTargets(workbook: XLSX.WorkBook, fileName: string) {
  const fallbackSeason = seasonFromFileName(fileName) || "2025";

  return workbook.SheetNames
    .filter((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return sheet ? isDetailedBlockSheet(sheet) : false;
    })
    .map((sheetName) => ({
      sheetName,
      season: seasonFromSheetName(sheetName) || fallbackSeason,
    }));
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

async function saveUploadRecord(
  filename: string,
  players: { number: number; name: string }[],
  addedCount: number,
  updatedCount: number,
  source: "file" | "manual"
) {
  try {
    await supabase.from("roster_uploads").insert({
      filename,
      player_count: players.length,
      added_count: addedCount,
      updated_count: updatedCount,
      source,
      players_snapshot: JSON.stringify(players),
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

async function findPlayerByNumberOrName(playerNumber: number, name: string) {
  const { data: playersByNumber } = await supabase
    .from("players")
    .select("id,name,number,is_pitcher")
    .eq("number", playerNumber)
    .limit(5);

  const exactByNumber = playersByNumber?.find((player) => player.number === playerNumber) || null;
  if (exactByNumber) return exactByNumber as PlayerRecord;

  const { data: playersByName } = await supabase
    .from("players")
    .select("id,name,number,is_pitcher")
    .eq("name", name)
    .limit(5);

  return (playersByName?.[0] as PlayerRecord | undefined) || null;
}

async function upsertPlayer(
  playerNumber: number,
  name: string,
  isPitcher: boolean,
  results?: UploadResults
) {
  let player = await findPlayerByNumberOrName(playerNumber, name);

  if (!player) {
    const { data: created } = await supabase
      .from("players")
      .insert({ number: playerNumber, name, is_pitcher: isPitcher })
      .select("id,name,number,is_pitcher")
      .single();

    if (created && results) results.players += 1;
    return (created as PlayerRecord | null) || null;
  }

  const updates: Record<string, unknown> = {};
  if (player.name !== name) updates.name = name;
  if (player.number !== playerNumber) updates.number = playerNumber;
  if (isPitcher && !player.is_pitcher) updates.is_pitcher = true;

  if (Object.keys(updates).length > 0) {
    await supabase.from("players").update(updates).eq("id", player.id);
    if (results) results.updated += 1;
    player = { ...player, ...updates } as PlayerRecord;
  }

  return player;
}

async function initializeRosterSeason(rosterPlayers: RosterPlayer[], overwrite: boolean) {
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
          position: rosterPlayer.position ?? null,
        })
        .select("id")
        .single();

      if (created) {
        playerId = created.id;
        results.players++;
      }
    }

    if (!playerId) continue;

    const { data: existingBatting } = await supabase
      .from("batting_stats")
      .select("id")
      .eq("player_id", playerId)
      .eq("season", TARGET_SEASON)
      .limit(1);

    if (!existingBatting || existingBatting.length === 0) {
      await supabase.from("batting_stats").insert({
        player_id: playerId,
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

    const { data: existingPitching } = await supabase
      .from("pitching_stats")
      .select("id")
      .eq("player_id", playerId)
      .eq("season", TARGET_SEASON)
      .limit(1);

    if (!existingPitching || existingPitching.length === 0) {
      await supabase.from("pitching_stats").insert({
        player_id: playerId,
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

function detectHeaderRows(rows: Row[]) {
  let battingHeaderRow = -1;
  let pitchingHeaderRow = -1;

  for (let index = 0; index < rows.length; index += 1) {
    const header = rows[index].map((cell) => String(cell ?? "").trim());
    if (header[0] === "배번" && header.includes("타석")) battingHeaderRow = index;
    if (header[0] === "배번" && header.includes("승")) pitchingHeaderRow = index;
  }

  return { battingHeaderRow, pitchingHeaderRow };
}

function detectColumns(headerRow: Row) {
  const header = headerRow.map((cell) => String(cell ?? "").trim());
  return {
    number: header.indexOf("배번"),
    name: header.indexOf("이름"),
    pa: header.indexOf("타석"),
    ab: header.indexOf("타수"),
    runs: header.indexOf("득점"),
    hits: header.indexOf("안타"),
    doubles: header.indexOf("2루타"),
    triples: header.indexOf("3루타"),
    hr: header.indexOf("홈런"),
    rbi: header.indexOf("타점"),
    bb: header.indexOf("볼넷"),
    hbp: header.indexOf("사구"),
    so: header.indexOf("삼진"),
    sb: header.indexOf("도루"),
    w: header.indexOf("승"),
    l: header.indexOf("패"),
    sv: header.indexOf("세"),
    hld: header.indexOf("홀"),
    ip: header.indexOf("이닝"),
    ha: header.indexOf("피안타"),
    runsAllowed: header.indexOf("실점"),
    er: header.indexOf("자책"),
    hrAllowed: header.indexOf("피홈런"),
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
        bb: Number(row[cols.bb]) || 0,
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
        bb: Number(row[cols.bb]) || 0,
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

async function processStructuredWorkbook(workbook: XLSX.WorkBook, results: UploadResults) {
  const gameCache = new Map<string, number>();

  if (workbook.SheetNames.includes("경기")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["경기"]) as Record<string, unknown>[];
    for (const row of rows) {
      const date = normalizeDateValue(row["날짜"]);
      const opponent = String(row["상대팀"] ?? "").trim();
      const season = normalizeSeason(row["시즌"]);

      if (!date || !opponent || !season) continue;
      await getOrCreateGameId(date, opponent, season, gameCache, results);
    }
  }

  if (workbook.SheetNames.includes("타자")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["타자"]) as Record<string, unknown>[];
    for (const row of rows) {
      const playerNumber = Number(row["배번"]);
      const name = String(row["이름"] || "").trim();
      if (!playerNumber || !name) continue;

      const player = await upsertPlayer(playerNumber, name, false, results);
      if (!player) continue;

      let gameId = null;
      let season = normalizeSeason(row["시즌"]);
      const date = normalizeDateValue(row["날짜"]);
      const opponent = String(row["상대팀"] ?? "").trim();

      if (date && opponent && season) {
        gameId = await getOrCreateGameId(date, opponent, season, gameCache, results);
      }

      await supabase.from("batting_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        pa: Number(row["타석"]) || 0,
        ab: Number(row["타수"]) || 0,
        runs: Number(row["득점"]) || 0,
        hits: Number(row["안타"]) || 0,
        doubles: Number(row["2루타"]) || 0,
        triples: Number(row["3루타"]) || 0,
        hr: Number(row["홈런"]) || 0,
        rbi: Number(row["타점"]) || 0,
        bb: Number(row["볼넷"]) || 0,
        hbp: Number(row["사구"]) || 0,
        so: Number(row["삼진"]) || 0,
        sb: Number(row["도루"]) || 0,
      });
      results.batting += 1;
    }
  }

  if (workbook.SheetNames.includes("투수")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["투수"]) as Record<string, unknown>[];
    for (const row of rows) {
      const playerNumber = Number(row["배번"]);
      const name = String(row["이름"] || "").trim();
      if (!playerNumber || !name) continue;

      const player = await upsertPlayer(playerNumber, name, true, results);
      if (!player) continue;

      let gameId = null;
      let season = normalizeSeason(row["시즌"]);
      const date = normalizeDateValue(row["날짜"]);
      const opponent = String(row["상대팀"] ?? "").trim();

      if (date && opponent && season) {
        gameId = await getOrCreateGameId(date, opponent, season, gameCache, results);
      }

      await supabase.from("pitching_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        w: Number(row["승"]) || 0,
        l: Number(row["패"]) || 0,
        sv: Number(row["세"]) || 0,
        hld: Number(row["홀"]) || 0,
        ip: Number(row["이닝"]) || 0,
        ha: Number(row["피안타"]) || 0,
        runs_allowed: Number(row["실점"]) || 0,
        er: Number(row["자책"]) || 0,
        bb: Number(row["볼넷"]) || 0,
        hbp: Number(row["사구"]) || 0,
        so: Number(row["삼진"]) || 0,
        hr_allowed: Number(row["피홈런"]) || 0,
      });
      results.pitching += 1;
    }
  }
}

async function processDetailedBlockSheet(
  sheet: XLSX.WorkSheet,
  season: string,
  isPitching: boolean,
  results: UploadResults,
  gameCache: Map<string, number>
) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
  let currentPlayer: { number: number; name: string } | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstCell = String(row[0] ?? "").trim();

    const playerHeader = firstCell.match(/^(\d+)\.\s*(.+)$/);
    if (playerHeader) {
      currentPlayer = {
        number: Number(playerHeader[1]),
        name: playerHeader[2].trim(),
      };
      continue;
    }

    if (!currentPlayer) continue;
    if (firstCell === "날짜" || !firstCell || firstCell.includes("시즌")) continue;

    const date = normalizeDateValue(row[0]);
    const opponent = String(row[1] ?? "").trim();
    if (!date || !opponent) continue;

    const player = await upsertPlayer(currentPlayer.number, currentPlayer.name, isPitching, results);
    if (!player) continue;

    const gameId = await getOrCreateGameId(date, opponent, season, gameCache, results);

    if (isPitching) {
      await supabase.from("pitching_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        w: Number(row[3]) || 0,
        l: Number(row[4]) || 0,
        sv: Number(row[5]) || 0,
        hld: Number(row[6]) || 0,
        ip: Number(row[7]) || 0,
        ha: Number(row[8]) || 0,
        runs_allowed: Number(row[9]) || 0,
        er: Number(row[10]) || 0,
        bb: Number(row[11]) || 0,
        hbp: Number(row[12]) || 0,
        so: Number(row[13]) || 0,
        hr_allowed: Number(row[14]) || 0,
      });
      results.pitching += 1;
    } else {
      await supabase.from("batting_stats").insert({
        player_id: player.id,
        game_id: gameId,
        season,
        pa: Number(row[3]) || 0,
        ab: Number(row[4]) || 0,
        runs: Number(row[5]) || 0,
        hits: Number(row[6]) || 0,
        doubles: Number(row[7]) || 0,
        triples: Number(row[8]) || 0,
        hr: Number(row[9]) || 0,
        rbi: Number(row[10]) || 0,
        bb: Number(row[11]) || 0,
        hbp: Number(row[12]) || 0,
        so: Number(row[13]) || 0,
        sb: Number(row[14]) || 0,
      });
      results.batting += 1;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

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

      const initialized = await initializeRosterSeason(players, overwrite);
      await saveUploadRecord("직접 입력", players, initialized.players, initialized.updated, "manual");
      revalidateConnectedViews();

      const skipped =
        initialized.skipped_batting > 0 ? ` (기존 기록 ${initialized.skipped_batting}건 유지)` : "";

      return withActiveSeasonCookie(NextResponse.json({
        success: true,
        message: `완료! 신규 ${initialized.players}명 추가${initialized.updated > 0 ? `, ${initialized.updated}명 정보 업데이트` : ""}${skipped}`,
        details: initialized,
      }), TARGET_SEASON);
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const overwrite = formData.get("overwrite") === "true";
    const checkOnly = formData.get("checkOnly") === "true";
    const skipConflicts = formData.get("skipConflicts") === "true";

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });

    const hasStructuredStatSheet =
      workbook.SheetNames.includes("경기") ||
      (workbook.SheetNames.includes("타자") && isStatSheet(workbook.Sheets["타자"])) ||
      (workbook.SheetNames.includes("투수") && isStatSheet(workbook.Sheets["투수"]));

    const seasonTotalTargets = getSeasonTotalTargets(workbook, file.name);
    const detailedBlockTargets = getDetailedBlockTargets(workbook, file.name);
    const rosterPlayers = extractRosterPlayers(workbook);

    const isStatsUpload =
      hasStructuredStatSheet || seasonTotalTargets.length > 0 || detailedBlockTargets.length > 0;

    if (!isStatsUpload && rosterPlayers.length > 0) {
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

      const initialized = await initializeRosterSeason(playersToProcess, overwrite);
      await saveUploadRecord(file.name, playersToProcess, initialized.players, initialized.updated, "file");
      revalidateConnectedViews();

      const skipped =
        initialized.skipped_batting > 0 ? ` (기존 기록 ${initialized.skipped_batting}건 유지)` : "";
      const skippedCount =
        skipConflicts && conflicts.length > 0 ? ` · 중복 ${conflicts.length}명 제외` : "";

      return withActiveSeasonCookie(NextResponse.json({
        success: true,
        message: `로스터 반영 완료! 신규 ${initialized.players}명 추가${initialized.updated > 0 ? `, ${initialized.updated}명 업데이트` : ""}${skipped}${skippedCount}`,
        details: initialized,
      }), TARGET_SEASON);
    }

    const statSeasons = collectFlexibleStatSeasons(workbook, file.name);
    if (statSeasons.length === 0) {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다. 시즌 통계 또는 로스터 형식의 파일을 업로드해 주세요." },
        { status: 400 }
      );
    }

    await clearSeasonSnapshot(statSeasons);

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

    if (hasStructuredStatSheet) {
      await processStructuredWorkbook(workbook, results);
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
        const isPitching = target.sheetName.includes("투수");
        await processDetailedBlockSheet(sheet, target.season, isPitching, results, gameCache);
      }
    }

    revalidateConnectedViews();
    const activeSeason = getLatestSeason(statSeasons, TARGET_SEASON);

    return withActiveSeasonCookie(NextResponse.json({
      success: true,
      message: `업로드 완료! 시즌 ${statSeasons.join(", ")} 데이터를 최신 파일 기준으로 교체했습니다. 선수 ${results.players}명 추가, 경기 ${results.games}개, 타자 ${results.batting}건, 투수 ${results.pitching}건 반영`,
      details: results,
    }), activeSeason);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 에러";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
