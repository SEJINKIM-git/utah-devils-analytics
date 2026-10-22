import * as XLSX from "xlsx";
import { sanitizeImportedPlayerName } from "@/lib/playerNameValidation";
import {
  COLUMN_ALIASES,
  type SpreadsheetRow,
  findColumnIndex,
  findHeaderRowIndex,
  findSheetNameByAliases,
  SHEET_ALIASES,
} from "@/lib/spreadsheetImport";

export type ParsedRosterPlayer = {
  number: number;
  name: string;
};

// Legacy roster sheets list every member and mark active players with this fill color.
const ACTIVE_PLAYER_COLOR = "EA9999";
const MAX_JERSEY_NUMBER = 999;

export function parseJerseyNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 && value <= MAX_JERSEY_NUMBER ? value : null;
  }

  const match = String(value ?? "")
    .trim()
    .match(/^(?:no\.?|#)?\s*(\d{1,3})\s*번?$/i);
  if (!match) return null;

  const number = Number(match[1]);
  return number > 0 && number <= MAX_JERSEY_NUMBER ? number : null;
}

function parseCombinedCell(value: unknown): ParsedRosterPlayer | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const numberFirst = text.match(/^(?:no\.?|#)?\s*(\d{1,3})\s*번?\s*[.\-):]?\s*(.+)$/i);
  if (numberFirst) {
    const number = parseJerseyNumber(numberFirst[1]);
    const name = sanitizeImportedPlayerName(numberFirst[2]);
    if (number && name) return { number, name };
  }

  const nameFirst = text.match(/^(.+?)\s*[(\[]?\s*(?:no\.?|#)?\s*(\d{1,3})\s*번?\s*[)\]]?$/i);
  if (nameFirst) {
    const number = parseJerseyNumber(nameFirst[2]);
    const name = sanitizeImportedPlayerName(nameFirst[1]);
    if (number && name) return { number, name };
  }

  return null;
}

function toSortedRoster(roster: Map<string, ParsedRosterPlayer>) {
  return Array.from(roster.values()).sort((a, b) => a.number - b.number);
}

function extractFromHeaderRow(rows: SpreadsheetRow[]): ParsedRosterPlayer[] {
  const headerRowIndex = findHeaderRowIndex(rows, [COLUMN_ALIASES.number, COLUMN_ALIASES.name], 20);
  if (headerRowIndex < 0) return [];

  const headerRow = rows[headerRowIndex];
  const numCol = findColumnIndex(headerRow, COLUMN_ALIASES.number);
  const nameCol = findColumnIndex(headerRow, COLUMN_ALIASES.name);
  const roster = new Map<string, ParsedRosterPlayer>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const number = parseJerseyNumber(row[numCol]);
    const name = sanitizeImportedPlayerName(row[nameCol]);
    if (!number || !name) continue;
    roster.set(`${number}:${name}`, { number, name });
  }

  return toSortedRoster(roster);
}

type CandidatePair = ParsedRosterPlayer & { highlighted: boolean };

function isHighlighted(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number) {
  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  const color = String(cell?.s?.fgColor?.rgb || cell?.s?.bgColor?.rgb || "").toUpperCase();
  return color.endsWith(ACTIVE_PLAYER_COLOR);
}

function collectPairs(
  sheet: XLSX.WorkSheet,
  rows: SpreadsheetRow[],
  order: "number-name" | "name-number"
): CandidatePair[] {
  const pairs: CandidatePair[] = [];

  rows.forEach((row, rowIndex) => {
    const cells = (row ?? [])
      .map((value, col) => ({ value, col }))
      .filter((cell) => String(cell.value ?? "").trim() !== "");

    let index = 0;
    while (index < cells.length) {
      const first = cells[index];
      const second = cells[index + 1];

      if (second) {
        const [numberCell, nameCell] = order === "number-name" ? [first, second] : [second, first];
        const number = parseJerseyNumber(numberCell.value);
        const name = sanitizeImportedPlayerName(nameCell.value);
        if (number && name) {
          pairs.push({ number, name, highlighted: isHighlighted(sheet, rowIndex, nameCell.col) });
          index += 2;
          continue;
        }
      }

      const combined = parseCombinedCell(first.value);
      if (combined) {
        pairs.push({ ...combined, highlighted: isHighlighted(sheet, rowIndex, first.col) });
      }
      index += 1;
    }
  });

  return pairs;
}

function extractWithoutHeader(sheet: XLSX.WorkSheet, rows: SpreadsheetRow[]): ParsedRosterPlayer[] {
  const numberFirst = collectPairs(sheet, rows, "number-name");
  const nameFirst = collectPairs(sheet, rows, "name-number");
  const pairs = nameFirst.length > numberFirst.length ? nameFirst : numberFirst;

  const hasHighlights = pairs.some((pair) => pair.highlighted);
  const roster = new Map<string, ParsedRosterPlayer>();
  for (const pair of pairs) {
    if (hasHighlights && !pair.highlighted) continue;
    roster.set(`${pair.number}:${pair.name}`, { number: pair.number, name: pair.name });
  }

  return toSortedRoster(roster);
}

function extractFromSheet(sheet: XLSX.WorkSheet): ParsedRosterPlayer[] {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as SpreadsheetRow[];
  if (rows.length === 0) return [];

  const fromHeader = extractFromHeaderRow(rows);
  if (fromHeader.length > 0) return fromHeader;

  return extractWithoutHeader(sheet, rows);
}

export function readUploadedWorkbook(fileName: string, buffer: ArrayBuffer): XLSX.WorkBook {
  if (/\.(csv|txt|tsv)$/i.test(fileName)) {
    const bytes = new Uint8Array(buffer);
    let text = new TextDecoder("utf-8").decode(bytes);
    // Excel on Korean Windows saves CSV as CP949 unless "CSV UTF-8" is chosen.
    if (text.includes("\uFFFD")) text = new TextDecoder("euc-kr").decode(bytes);
    return XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string" });
  }

  return XLSX.read(buffer, { type: "array", cellStyles: true });
}

/**
 * Reads jersey numbers and names from any sheet layout: with or without a header row,
 * number/name in either column order, or both in a single cell (e.g. "35 홍길동").
 */
export function extractRosterPlayersFromWorkbook(workbook: XLSX.WorkBook): ParsedRosterPlayer[] {
  const preferred = findSheetNameByAliases(workbook.SheetNames, SHEET_ALIASES.roster);
  const sheetNames = preferred
    ? [preferred, ...workbook.SheetNames.filter((name) => name !== preferred)]
    : workbook.SheetNames;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const players = extractFromSheet(sheet);
    if (players.length > 0) return players;
  }

  return [];
}
