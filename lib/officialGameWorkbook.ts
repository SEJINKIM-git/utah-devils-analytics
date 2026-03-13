import * as XLSX from "xlsx";

type Row = unknown[];

export type LiveGameBattingEntry = {
  order: number;
  position: string;
  name: string;
  pa: number;
  ab: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  avg: string;
};

export type LiveGamePitchingEntry = {
  name: string;
  decision: string;
  ip: number;
  ha: number;
  runs_allowed: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr_allowed: number;
  batters_faced: number;
  ab_against: number;
  pitches: number;
  w: number;
  l: number;
  sv: number;
  hld: number;
  era: string;
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

const toRows = (sheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "#DIV/0!") return 0;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toFlag = (value: unknown, positives: string[]) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return 0;
  const normalized = normalizeHeader(raw);
  if (positives.map((item) => normalizeHeader(item)).includes(normalized)) return 1;
  return toNumber(raw);
};

function buildHeaderIndex(row: Row) {
  const header = row.map((cell) => normalizeHeader(cell));
  const find = (...candidates: string[]) => {
    const normalizedCandidates = candidates.map((candidate) => normalizeHeader(candidate));
    return header.findIndex((cell) => normalizedCandidates.includes(cell));
  };

  return { header, find };
}

function resolveBattingColumns(row: Row) {
  const { find } = buildHeaderIndex(row);
  return {
    order: find("타순"),
    position: find("포지션", "수비"),
    name: find("이름", "선수명"),
    ab: find("타수", "ab"),
    runs: find("득점", "r"),
    hits: find("안타", "h"),
    doubles: find("2루타", "2b"),
    triples: find("3루타", "3b"),
    hr: find("홈런", "hr"),
    rbi: find("타점", "rbi"),
    bb: find("볼넷", "bb"),
    hbp: find("사구", "hbp"),
    so: find("삼진", "so"),
    avg: find("타율", "avg"),
    sb: find("도루", "sb"),
  };
}

function resolvePitchingColumns(row: Row) {
  const { find } = buildHeaderIndex(row);
  return {
    name: find("이름", "선수명"),
    decision: find("결과", "승패"),
    ip: find("이닝", "ip"),
    ha: find("피안타", "h"),
    runsAllowed: find("실점", "r"),
    er: find("자책", "er"),
    walksCombined: find("4사구", "4구", "볼넷", "bb"),
    hbp: find("사구", "hbp"),
    so: find("삼진", "so"),
    hrAllowed: find("피홈런", "hr"),
    battersFaced: find("타자", "bf"),
    abAgainst: find("타수", "ab"),
    pitches: find("투구수", "pitches", "p"),
    w: find("승", "승리", "숭리", "w"),
    l: find("패", "패배", "l"),
    sv: find("세", "세이브", "sv"),
    hld: find("홀", "홀드", "hld"),
    era: find("era"),
  };
}

function findHeaderRowIndex(rows: Row[], kind: "batting" | "pitching") {
  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const row = rows[index];
    const essentials =
      kind === "batting"
        ? (() => {
            const cols = resolveBattingColumns(row);
            return [cols.order, cols.position, cols.name, cols.ab, cols.hits];
          })()
        : (() => {
            const cols = resolvePitchingColumns(row);
            return [cols.name, cols.ip, cols.ha, cols.runsAllowed, cols.er, cols.so];
          })();
    if (essentials.every((column) => column >= 0)) return index;
  }

  return -1;
}

export function isOfficialLiveGameWorkbook(workbook: XLSX.WorkBook) {
  const battingSheet = workbook.Sheets["타자 기록"];
  const pitchingSheet = workbook.Sheets["투수 기록"];
  if (!battingSheet && !pitchingSheet) return false;

  const battingOk = battingSheet ? findHeaderRowIndex(toRows(battingSheet), "batting") >= 0 : false;
  const pitchingOk = pitchingSheet ? findHeaderRowIndex(toRows(pitchingSheet), "pitching") >= 0 : false;
  return battingOk || pitchingOk;
}

export function parseOfficialGameBattingSheet(sheet: XLSX.WorkSheet): LiveGameBattingEntry[] {
  const rows = toRows(sheet);
  const headerRowIndex = findHeaderRowIndex(rows, "batting");
  if (headerRowIndex < 0) return [];

  const cols = resolveBattingColumns(rows[headerRowIndex]);
  const entries: LiveGameBattingEntry[] = [];

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const name = cols.name >= 0 ? String(row[cols.name] ?? "").trim() : "";
    const hasCoreStats = [cols.ab, cols.runs, cols.hits, cols.bb, cols.so].some((column) => {
      if (column < 0) return false;
      const cell = row[column];
      return cell !== "" && cell !== null && cell !== undefined;
    });

    if (!name) {
      if (entries.length > 0 && !hasCoreStats) break;
      continue;
    }

    if (/합계|통산|시즌/.test(name)) continue;

    const ab = cols.ab >= 0 ? toNumber(row[cols.ab]) : 0;
    const hits = cols.hits >= 0 ? toNumber(row[cols.hits]) : 0;
    const bb = cols.bb >= 0 ? toNumber(row[cols.bb]) : 0;
    const hbp = cols.hbp >= 0 ? toNumber(row[cols.hbp]) : 0;

    entries.push({
      order: cols.order >= 0 ? toNumber(row[cols.order]) || entries.length + 1 : entries.length + 1,
      position: cols.position >= 0 ? String(row[cols.position] ?? "").trim() : "",
      name,
      pa: ab + bb + hbp,
      ab,
      runs: cols.runs >= 0 ? toNumber(row[cols.runs]) : 0,
      hits,
      doubles: cols.doubles >= 0 ? toNumber(row[cols.doubles]) : 0,
      triples: cols.triples >= 0 ? toNumber(row[cols.triples]) : 0,
      hr: cols.hr >= 0 ? toNumber(row[cols.hr]) : 0,
      rbi: cols.rbi >= 0 ? toNumber(row[cols.rbi]) : 0,
      bb,
      hbp,
      so: cols.so >= 0 ? toNumber(row[cols.so]) : 0,
      sb: cols.sb >= 0 ? toNumber(row[cols.sb]) : 0,
      avg: cols.avg >= 0
        ? String(row[cols.avg] ?? "").trim() || (ab > 0 ? (hits / ab).toFixed(3) : "0")
        : (ab > 0 ? (hits / ab).toFixed(3) : "0"),
    });
  }

  return entries;
}

export function parseOfficialGamePitchingSheet(sheet: XLSX.WorkSheet): LiveGamePitchingEntry[] {
  const rows = toRows(sheet);
  const headerRowIndex = findHeaderRowIndex(rows, "pitching");
  if (headerRowIndex < 0) return [];

  const cols = resolvePitchingColumns(rows[headerRowIndex]);
  const entries: LiveGamePitchingEntry[] = [];

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const name = cols.name >= 0 ? String(row[cols.name] ?? "").trim() : "";
    const hasCoreStats = [cols.ip, cols.ha, cols.runsAllowed, cols.er, cols.so].some((column) => {
      if (column < 0) return false;
      const cell = row[column];
      return cell !== "" && cell !== null && cell !== undefined;
    });

    if (!name) {
      if (entries.length > 0 && !hasCoreStats) break;
      continue;
    }

    if (/합계|통산|시즌/.test(name)) continue;

    const decision = cols.decision >= 0 ? String(row[cols.decision] ?? "").trim() : "";
    const ip = cols.ip >= 0 ? toNumber(row[cols.ip]) : 0;
    const er = cols.er >= 0 ? toNumber(row[cols.er]) : 0;
    const walksCombined = cols.walksCombined >= 0 ? toNumber(row[cols.walksCombined]) : 0;
    const hbp = cols.hbp >= 0 ? toNumber(row[cols.hbp]) : 0;

    entries.push({
      name,
      decision,
      ip,
      ha: cols.ha >= 0 ? toNumber(row[cols.ha]) : 0,
      runs_allowed: cols.runsAllowed >= 0 ? toNumber(row[cols.runsAllowed]) : 0,
      er,
      bb: walksCombined,
      hbp,
      so: cols.so >= 0 ? toNumber(row[cols.so]) : 0,
      hr_allowed: cols.hrAllowed >= 0 ? toNumber(row[cols.hrAllowed]) : 0,
      batters_faced: cols.battersFaced >= 0 ? toNumber(row[cols.battersFaced]) : 0,
      ab_against: cols.abAgainst >= 0 ? toNumber(row[cols.abAgainst]) : 0,
      pitches: cols.pitches >= 0 ? toNumber(row[cols.pitches]) : 0,
      w: cols.w >= 0 ? toFlag(row[cols.w], ["승", "승리", "w"]) : toFlag(decision, ["승", "w"]),
      l: cols.l >= 0 ? toFlag(row[cols.l], ["패", "패배", "l"]) : toFlag(decision, ["패", "l"]),
      sv: cols.sv >= 0 ? toFlag(row[cols.sv], ["세", "세이브", "sv"]) : toFlag(decision, ["세", "sv"]),
      hld: cols.hld >= 0 ? toNumber(row[cols.hld]) : 0,
      era: cols.era >= 0
        ? String(row[cols.era] ?? "").trim() || (ip > 0 ? ((er / ip) * 9).toFixed(2) : "0")
        : (ip > 0 ? ((er / ip) * 9).toFixed(2) : "0"),
    });
  }

  return entries;
}

export function parseOfficialGameHighlights(sheet?: XLSX.WorkSheet) {
  if (!sheet) return [];

  const rows = toRows(sheet);
  const highlights: string[] = [];

  for (const row of rows) {
    const label = String(row[0] ?? "").trim();
    const value = String(row[1] ?? "").trim();
    if (!label || !value || value === "-") continue;
    highlights.push(`${label}: ${value}`);
  }

  return highlights;
}
