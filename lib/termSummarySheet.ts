import { buildPlayerIdentityKey } from "@/lib/playerIdentity";
import type { TermBattingLine, TermPitchingLine, TermRosterPlayer } from "@/lib/seasonTerms";
import {
  COLUMN_ALIASES,
  type SpreadsheetRow,
  findColumnIndex,
  hasColumn,
  normalizeSpreadsheetLabel,
  rowHasAnyColumn,
} from "@/lib/spreadsheetImport";

// 공식 시즌 누적 파일의 학기 요약 시트("25 Spring", "2024 Fall" …) 파서 — 서버(업로드)에서만 사용

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findGamesColumn(headerRow: SpreadsheetRow) {
  return headerRow.findIndex((cell) => ["경기", "g", "games", "gp"].includes(normalizeSpreadsheetLabel(cell)));
}

function isIdentityHeader(row: SpreadsheetRow) {
  return hasColumn(row, COLUMN_ALIASES.number) && hasColumn(row, COLUMN_ALIASES.name);
}

/** "배번 | 이름 | 경기 | 타석 …" 형태 학기 요약 시트를 로스터 + 학기 기록으로 파싱 */
export function parseTermSummaryRows(rows: SpreadsheetRow[]) {
  const battingHeader = rows.findIndex(
    (row) => isIdentityHeader(row) && rowHasAnyColumn(row, [COLUMN_ALIASES.pa, COLUMN_ALIASES.ab, COLUMN_ALIASES.hits])
  );
  const pitchingHeader = rows.findIndex(
    (row) => isIdentityHeader(row) && rowHasAnyColumn(row, [COLUMN_ALIASES.w, COLUMN_ALIASES.ip, COLUMN_ALIASES.er])
  );

  const players = new Map<string, TermRosterPlayer>();
  const batting: TermBattingLine[] = [];
  const pitching: TermPitchingLine[] = [];

  const readIdentity = (row: SpreadsheetRow, numberCol: number, nameCol: number) => {
    const number = Number(row[numberCol]);
    const name = String(row[nameCol] ?? "").trim();
    if (!Number.isFinite(number) || !name || name === "통산" || name.includes("시즌")) return null;
    players.set(buildPlayerIdentityKey(name, number), { number, name });
    return { number, name };
  };

  if (battingHeader >= 0) {
    const header = rows[battingHeader];
    const col = (aliases: readonly string[]) => findColumnIndex(header, aliases);
    const cols = {
      number: col(COLUMN_ALIASES.number),
      name: col(COLUMN_ALIASES.name),
      g: findGamesColumn(header),
      pa: col(COLUMN_ALIASES.pa),
      ab: col(COLUMN_ALIASES.ab),
      runs: col(COLUMN_ALIASES.runs),
      hits: col(COLUMN_ALIASES.hits),
      doubles: col(COLUMN_ALIASES.doubles),
      triples: col(COLUMN_ALIASES.triples),
      hr: col(COLUMN_ALIASES.hr),
      rbi: col(COLUMN_ALIASES.rbi),
      bb: col(COLUMN_ALIASES.battingBb),
      hbp: col(COLUMN_ALIASES.hbp),
      so: col(COLUMN_ALIASES.so),
      sb: col(COLUMN_ALIASES.sb),
    };
    const end = pitchingHeader > battingHeader ? pitchingHeader : rows.length;
    const at = (row: SpreadsheetRow, index: number) => (index >= 0 ? toNumber(row[index]) : 0);

    for (let index = battingHeader + 1; index < end; index += 1) {
      const row = rows[index] ?? [];
      const identity = readIdentity(row, cols.number, cols.name);
      if (!identity) continue;
      batting.push({
        ...identity,
        g: at(row, cols.g),
        pa: at(row, cols.pa),
        ab: at(row, cols.ab),
        runs: at(row, cols.runs),
        hits: at(row, cols.hits),
        doubles: at(row, cols.doubles),
        triples: at(row, cols.triples),
        hr: at(row, cols.hr),
        rbi: at(row, cols.rbi),
        bb: at(row, cols.bb),
        hbp: at(row, cols.hbp),
        so: at(row, cols.so),
        sb: at(row, cols.sb),
      });
    }
  }

  if (pitchingHeader >= 0) {
    const header = rows[pitchingHeader];
    const col = (aliases: readonly string[]) => findColumnIndex(header, aliases);
    const cols = {
      number: col(COLUMN_ALIASES.number),
      name: col(COLUMN_ALIASES.name),
      g: findGamesColumn(header),
      w: col(COLUMN_ALIASES.w),
      l: col(COLUMN_ALIASES.l),
      sv: col(COLUMN_ALIASES.sv),
      hld: col(COLUMN_ALIASES.hld),
      ip: col(COLUMN_ALIASES.ip),
      ha: col(COLUMN_ALIASES.ha),
      runsAllowed: col(COLUMN_ALIASES.runsAllowed),
      er: col(COLUMN_ALIASES.er),
      bb: col(COLUMN_ALIASES.pitchingBb),
      hbp: col(COLUMN_ALIASES.hbp),
      so: col(COLUMN_ALIASES.so),
      hrAllowed: col(COLUMN_ALIASES.hrAllowed),
    };
    const end = battingHeader > pitchingHeader ? battingHeader : rows.length;
    const at = (row: SpreadsheetRow, index: number) => (index >= 0 ? toNumber(row[index]) : 0);

    for (let index = pitchingHeader + 1; index < end; index += 1) {
      const row = rows[index] ?? [];
      const identity = readIdentity(row, cols.number, cols.name);
      if (!identity) continue;
      pitching.push({
        ...identity,
        g: at(row, cols.g),
        w: at(row, cols.w),
        l: at(row, cols.l),
        sv: at(row, cols.sv),
        hld: at(row, cols.hld),
        ip: at(row, cols.ip),
        ha: at(row, cols.ha),
        runs_allowed: at(row, cols.runsAllowed),
        er: at(row, cols.er),
        bb: at(row, cols.bb),
        hbp: at(row, cols.hbp),
        so: at(row, cols.so),
        hr_allowed: at(row, cols.hrAllowed),
      });
    }
  }

  return { players: Array.from(players.values()), batting, pitching };
}
