import * as XLSX from "xlsx";
import { getDefaultUploadSeason, normalizeGameDateInput } from "@/lib/gameFileMeta";

export type SpreadsheetRow = unknown[];
export type StatSheetKind = "games" | "batting" | "pitching";
export type PlayerStatKind = "batting" | "pitching";

export const SHEET_ALIASES = {
  roster: ["전체", "선수", "선수단", "명단", "로스터", "roster", "players", "playerlist"],
  games: ["경기", "게임", "game", "games", "matches", "matchschedule"],
  batting: ["타자", "타격", "타자기록", "타격기록", "batting", "hitting", "batters", "hitters"],
  pitching: ["투수", "피칭", "투수기록", "pitching", "pitchers"],
  careerTotals: ["careertotals", "career totals", "career", "통산", "통산기록", "전체통산"],
} as const;

export const COLUMN_ALIASES = {
  season: ["시즌", "연도", "year", "season"],
  date: ["날짜", "경기일", "경기날짜", "일자", "date", "gamedate", "matchdate"],
  opponent: ["상대팀", "상대", "opponent", "vs", "opponentteam"],
  number: ["배번", "번호", "등번호", "선수번호", "no", "num", "number", "jersey", "jerseynumber"],
  name: ["이름", "선수명", "성명", "player", "playername", "name"],
  position: ["포지션", "position", "pos"],
  pa: ["타석", "pa", "plateappearance", "plateappearances"],
  ab: ["타수", "ab", "atbat", "atbats"],
  runs: ["득점", "run", "runs"],
  hits: ["안타", "hit", "hits"],
  doubles: ["2루타", "이루타", "double", "doubles", "2b"],
  triples: ["3루타", "삼루타", "triple", "triples", "3b"],
  hr: ["홈런", "hr", "homerun", "homeruns", "homer", "homers"],
  rbi: ["타점", "rbi"],
  battingBb: ["볼넷", "walk", "walks", "baseonballs"],
  pitchingBb: ["4사구", "4구", "볼넷", "walk", "walks", "bb", "baseonballs"],
  hbp: ["사구", "hbp", "hitbypitch"],
  so: ["삼진", "k", "so", "strikeout", "strikeouts"],
  sb: ["도루", "sb", "steal", "steals", "stolenbase", "stolenbases"],
  w: ["승", "w", "win", "wins"],
  l: ["패", "l", "loss", "losses"],
  sv: ["세", "sv", "save", "saves"],
  hld: ["홀", "hld", "hold", "holds"],
  ip: ["이닝", "ip", "inning", "innings"],
  ha: ["피안타", "ha", "hitsallowed"],
  runsAllowed: ["실점", "ra", "runsallowed"],
  er: ["자책", "자책점", "er", "earnedrun", "earnedruns"],
  hrAllowed: ["피홈런", "hrallowed", "home runs allowed", "homerunsallowed"],
} as const;

function tokenize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "");
}

function aliasMatchesToken(token: string, alias: string) {
  const normalizedAlias = tokenize(alias);
  if (!token || !normalizedAlias) return false;

  return (
    token === normalizedAlias ||
    token.startsWith(normalizedAlias) ||
    token.endsWith(normalizedAlias) ||
    token.includes(normalizedAlias)
  );
}

export function normalizeSpreadsheetLabel(value: unknown) {
  return tokenize(value);
}

export function matchesAlias(value: unknown, aliases: readonly string[]) {
  const token = tokenize(value);
  return aliases.some((alias) => aliasMatchesToken(token, alias));
}

export function findColumnIndex(headerRow: SpreadsheetRow, aliases: readonly string[]) {
  return headerRow.findIndex((cell) => matchesAlias(cell, aliases));
}

export function hasColumn(headerRow: SpreadsheetRow, aliases: readonly string[]) {
  return findColumnIndex(headerRow, aliases) !== -1;
}

export function rowHasAnyColumn(headerRow: SpreadsheetRow, aliasGroups: ReadonlyArray<readonly string[]>) {
  return aliasGroups.some((aliases) => hasColumn(headerRow, aliases));
}

export function findHeaderRowIndex(
  rows: SpreadsheetRow[],
  requiredGroups: ReadonlyArray<readonly string[]>,
  maxRows = 12
) {
  const limit = Math.min(rows.length, maxRows);

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] ?? [];
    if (requiredGroups.every((aliases) => hasColumn(row, aliases))) {
      return index;
    }
  }

  return -1;
}

export function findSheetNameByAliases(
  sheetNames: string[],
  aliases: readonly string[]
) {
  return (
    sheetNames.find((sheetName) => matchesAlias(sheetName, aliases)) || null
  );
}

export function getStructuredSheetNames(workbook: XLSX.WorkBook) {
  return {
    games: findSheetNameByAliases(workbook.SheetNames, SHEET_ALIASES.games),
    batting: findSheetNameByAliases(workbook.SheetNames, SHEET_ALIASES.batting),
    pitching: findSheetNameByAliases(workbook.SheetNames, SHEET_ALIASES.pitching),
  };
}

export function extractSeasonFromSheetName(sheetName: string): string | null {
  const trimmed = String(sheetName || "").trim();
  if (!trimmed) return null;

  if (matchesAlias(trimmed, SHEET_ALIASES.careerTotals)) {
    return "Career";
  }

  const longYear = trimmed.match(/\b(20\d{2})\b/);
  if (longYear) return longYear[1];

  const shortYearOnly = trimmed.match(/^(\d{2})$/);
  if (shortYearOnly) return `20${shortYearOnly[1]}`;

  const shortYearSeason = trimmed.match(/(?:^|[^0-9])(\d{2})\s*(?:시즌|season)\b/i);
  if (shortYearSeason) return `20${shortYearSeason[1]}`;

  return null;
}

function buildIsoDate(year: number, month: number, day: number) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeSpreadsheetDateValue(
  value: unknown,
  fallbackSeason = getDefaultUploadSeason()
) {
  if (!value && value !== 0) return null;

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return buildIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate()) || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return buildIsoDate(parsed.y, parsed.m, parsed.d) || null;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    return buildIsoDate(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)), Number(raw.slice(6, 8))) || null;
  }

  return normalizeGameDateInput(raw, fallbackSeason) || null;
}

export function detectPlayerStatKind(
  sheetName: string,
  headerRow: SpreadsheetRow
): PlayerStatKind | null {
  if (matchesAlias(sheetName, SHEET_ALIASES.pitching)) return "pitching";
  if (matchesAlias(sheetName, SHEET_ALIASES.batting)) return "batting";

  if (rowHasAnyColumn(headerRow, [COLUMN_ALIASES.ip, COLUMN_ALIASES.w, COLUMN_ALIASES.er])) {
    return "pitching";
  }

  if (rowHasAnyColumn(headerRow, [COLUMN_ALIASES.pa, COLUMN_ALIASES.ab, COLUMN_ALIASES.hits])) {
    return "batting";
  }

  return null;
}
