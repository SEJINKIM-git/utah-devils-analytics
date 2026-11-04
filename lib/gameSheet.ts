import * as XLSX from "xlsx";
import {
  type LiveGameBattingEntry,
  type LiveGamePitchingEntry,
  findOfficialGameSheet,
  parseOfficialGameBattingSheet,
  parseOfficialGameHighlights,
  parseOfficialGamePitchingSheet,
} from "@/lib/officialGameWorkbook";
import { extractGameMetaFromFilename } from "@/lib/gameFileMeta";
import { sanitizeImportedPlayerName } from "@/lib/playerNameValidation";
import { ERA_BASE_INNINGS, computeEra, formatRate } from "@/lib/statFormulas";
import { formatIP } from "@/lib/statFormatting";

/**
 * Utah Devils 경기 기록지 v3.0 파서.
 *
 * v3.0 기록지는 타석마다 결과 표기(안타·삼진·희생플라이…)를 넣고 나머지는 수식으로 계산한다.
 * 수식 결과값(캐시)은 Excel로 저장하지 않은 파일에는 비어 있으므로, 이 파서는 타석 결과 표기에서
 * 직접 계산하고, 캐시 값이 있으면 대조만 한다. 이전 형식 파일은 기존 파서(officialGameWorkbook)로 처리한다.
 */

type Row = unknown[];

/** 기록지 '기록 방법' 시트의 결과 표기 18종 */
export const PA_RESULTS = {
  안타: { ab: 1, hit: 1 },
  "2루타": { ab: 1, hit: 1, double: 1 },
  "3루타": { ab: 1, hit: 1, triple: 1 },
  홈런: { ab: 1, hit: 1, hr: 1 },
  삼진: { ab: 1, so: 1 },
  루킹삼진: { ab: 1, so: 1 },
  낫아웃출루: { ab: 1, so: 1 },
  땅볼: { ab: 1 },
  뜬공: { ab: 1 },
  직선타: { ab: 1 },
  병살: { ab: 1 },
  실책출루: { ab: 1 },
  야수선택: { ab: 1 },
  볼넷: { bb: 1 },
  사구: { hbp: 1 },
  희생플라이: { sf: 1 },
  희생번트: { sh: 1 },
  포수방해: { ci: 1 },
} as const satisfies Record<string, Partial<Record<"ab" | "hit" | "double" | "triple" | "hr" | "so" | "bb" | "hbp" | "sf" | "sh" | "ci", 1>>>;

export type GameBattingEntry = LiveGameBattingEntry & { sf: number | null; sh: number | null; ci: number | null };
export type GamePitchingEntry = LiveGamePitchingEntry & { pitches: number; outs: number | null };

export type GameSheetInfo = {
  date: string | null;
  opponent: string | null;
  season: string | null;
  isHome: boolean | null;
  location: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  defenseOuts: number | null;
  eraBase: number | null;
  version: string | null;
};

export type GameSheetParse = {
  format: "v3" | "legacy";
  info: GameSheetInfo;
  batting: GameBattingEntry[];
  pitching: GamePitchingEntry[];
  highlights: string[];
  review: { status: string | null; pending: string[] };
  warnings: string[];
};

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").trim().toLowerCase();
const text = (v: unknown) => String(v ?? "").trim();

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function cellValue(sheet: XLSX.WorkSheet, address: string) {
  return sheet[address] as XLSX.CellObject | undefined;
}

function toIsoDate(cell: XLSX.CellObject | undefined): string | null {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return null;
  if (cell.v instanceof Date) {
    const d = cell.v;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof cell.v === "number") {
    const p = XLSX.SSF.parse_date_code(cell.v);
    if (p?.y) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const m = String(cell.v).match(/(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function findSheet(workbook: XLSX.WorkBook, names: string[]) {
  const wanted = names.map(norm);
  const name = workbook.SheetNames.find((n) => wanted.includes(norm(n)));
  return name ? workbook.Sheets[name] : undefined;
}

// ── 경기 정보 ──────────────────────────────────────────────────────────────────
function parseGameInfo(sheet: XLSX.WorkSheet | undefined, warnings: string[]): GameSheetInfo {
  const info: GameSheetInfo = {
    date: null, opponent: null, season: null, isHome: null, location: null,
    scoreUs: null, scoreThem: null, defenseOuts: null, eraBase: null, version: null,
  };
  if (!sheet) return info;

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:D1");
  const byLabel = new Map<string, string>(); // 라벨 → 값 셀 주소 (B열 라벨, C열 값)
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const label = cellValue(sheet, XLSX.utils.encode_cell({ r, c: 1 }))?.v;
    if (label !== undefined) byLabel.set(norm(label), XLSX.utils.encode_cell({ r, c: 2 }));
  }
  const at = (label: string) => {
    const addr = byLabel.get(norm(label));
    return addr ? cellValue(sheet, addr) : undefined;
  };

  const dateCell = at("날짜");
  info.date = toIsoDate(dateCell);
  if (dateCell?.f && /TODAY\(\)/i.test(dateCell.f)) {
    warnings.push("경기 정보 날짜가 입력되지 않았습니다 (=TODAY() 수식 그대로). 파일을 저장한 날짜가 경기 날짜로 들어갑니다.");
  }
  info.season = info.date ? info.date.slice(0, 4) : null;
  info.opponent = text(at("상대팀")?.v) || null;
  const homeAway = text(at("홈/원정")?.v);
  info.isHome = homeAway === "홈" ? true : homeAway === "원정" ? false : null;
  info.location = text(at("장소")?.v) || null;
  info.scoreUs = toInt(at("우리 점수")?.v);
  info.scoreThem = toInt(at("상대 점수")?.v);
  const defense = at("우리 수비 이닝")?.v;
  if (defense !== undefined && defense !== "") {
    const n = Number(defense);
    const full = Math.floor(n);
    const digit = Math.round((n - full) * 10);
    if (Number.isFinite(n) && [0, 1, 2].includes(digit)) info.defenseOuts = full * 3 + digit;
    else warnings.push(`경기 정보 '우리 수비 이닝' 값 ${defense}은 야구 표기가 아닙니다 (7, 6.1, 6.2 형식).`);
  }
  const eraBase = Number(at("ERA 기준 이닝")?.v);
  info.eraBase = Number.isFinite(eraBase) && eraBase > 0 ? eraBase : null;
  info.version = text(at("버전")?.v) || null;
  return info;
}

// ── 검수 ──────────────────────────────────────────────────────────────────────
function parseReview(sheet: XLSX.WorkSheet | undefined) {
  const review = { status: null as string | null, pending: [] as string[] };
  if (!sheet) return review;
  // 시트 범위가 B열부터 시작할 수 있으므로 sheet_to_json 대신 셀 주소(B=라벨, F=상태)로 읽는다
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:G1");
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const label = text(cellValue(sheet, XLSX.utils.encode_cell({ r, c: 1 }))?.v);
    const state = text(cellValue(sheet, XLSX.utils.encode_cell({ r, c: 5 }))?.v);
    if (!label) continue;
    if (norm(label) === norm("검수 요약")) review.status = state || null;
    else if (state === "확인 필요" || state === "입력 대기") review.pending.push(`${label}(${state})`);
  }
  return review;
}

// ── 타자 ──────────────────────────────────────────────────────────────────────
function parseBattingV3(rows: Row[], warnings: string[]): GameBattingEntry[] | null {
  const header = rows[0] ?? [];
  const paCols = header
    .map((h, i) => ({ i, m: norm(h).match(/^(\d+)타석$/) }))
    .filter((x) => x.m)
    .map((x) => x.i);
  if (paCols.length === 0) return null; // 이전 형식

  const col = (...names: string[]) => header.findIndex((h) => names.map(norm).includes(norm(h)));
  const c = {
    order: col("타순"), name: col("이름"), position: col("포지션"),
    runs: col("득점"), rbi: col("타점"), sb: col("도루"),
    // 대조용 수식 결과 칸
    ab: col("타수"), hits: col("안타"), so: col("삼진"), bb: col("볼넷"), pa: col("타석 PA", "타석"),
  };

  const out: GameBattingEntry[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const rawName = text(row[c.name]);
    const codes = paCols.map((i) => text(row[i])).filter(Boolean);
    const extras = [c.runs, c.rbi, c.sb].map((i) => (i >= 0 ? toInt(row[i]) ?? 0 : 0));
    if (/합계/.test(rawName)) break;
    if (!rawName) {
      if (codes.length || extras.some((v) => v > 0)) warnings.push(`타자 기록 ${r + 1}행: 이름 없이 기록이 입력됨 — 건너뜀`);
      continue;
    }
    const name = sanitizeImportedPlayerName(rawName);
    if (!name) {
      warnings.push(`타자 기록 ${r + 1}행: 이름 '${rawName}'을 선수 이름으로 인식하지 못함 — 건너뜀`);
      continue;
    }

    const t = { pa: 0, ab: 0, hit: 0, double: 0, triple: 0, hr: 0, so: 0, bb: 0, hbp: 0, sf: 0, sh: 0, ci: 0 };
    for (const code of codes) {
      const effect = (PA_RESULTS as Record<string, Record<string, number>>)[code.replace(/\s+/g, "")];
      if (!effect) {
        warnings.push(`타자 기록 ${r + 1}행 ${name}: 목록에 없는 타석 결과 '${code}' — 타석으로만 셈`);
        t.pa += 1;
        continue;
      }
      t.pa += 1;
      for (const [k, v] of Object.entries(effect)) t[k as keyof typeof t] += v;
    }

    // 수식 결과(캐시)가 있으면 대조
    const cached: Array<[string, number, number | null]> = [
      ["타석", t.pa, c.pa >= 0 ? toInt(row[c.pa]) : null],
      ["타수", t.ab, c.ab >= 0 ? toInt(row[c.ab]) : null],
      ["안타", t.hit, c.hits >= 0 ? toInt(row[c.hits]) : null],
      ["삼진", t.so, c.so >= 0 ? toInt(row[c.so]) : null],
      ["볼넷", t.bb, c.bb >= 0 ? toInt(row[c.bb]) : null],
    ];
    const diff = cached.filter(([, mine, sheet]) => sheet !== null && sheet !== mine);
    if (diff.length) {
      warnings.push(`타자 기록 ${name}: 기록지 수식 값과 타석 결과 계산이 다름 (${diff.map(([k, m, s]) => `${k} ${s}→${m}`).join(", ")}) — 타석 결과 기준으로 저장`);
    }

    const [runs, rbi, sb] = extras;
    out.push({
      order: c.order >= 0 ? toInt(row[c.order]) ?? out.length + 1 : out.length + 1,
      position: c.position >= 0 ? text(row[c.position]) : "",
      name,
      pa: t.pa, ab: t.ab, runs, hits: t.hit, doubles: t.double, triples: t.triple, hr: t.hr, rbi,
      bb: t.bb, hbp: t.hbp, so: t.so, sb, sf: t.sf, sh: t.sh, ci: t.ci,
      avg: formatRate(t.ab > 0 ? t.hit / t.ab : null, 3, "0.000"),
    });
  }
  return out;
}

// ── 투수 ──────────────────────────────────────────────────────────────────────
function parsePitchingV3(rows: Row[], warnings: string[]): GamePitchingEntry[] | null {
  const header = rows[0] ?? [];
  const col = (...names: string[]) => header.findIndex((h) => names.map(norm).includes(norm(h)));
  const c = {
    name: col("이름"), decision: col("결과"), outs: col("아웃"), pitches: col("투구수"), ha: col("피안타"),
    runs: col("실점"), er: col("자책"), bb: col("볼넷"), hbp: col("사구"), so: col("삼진"), hr: col("피홈런"),
  };
  if (c.outs < 0) return null; // 이전 형식 (이닝 칸 사용)

  const out: GamePitchingEntry[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const rawName = text(row[c.name]);
    if (/합계/.test(rawName)) break;
    if (!rawName) continue;
    const name = sanitizeImportedPlayerName(rawName);
    if (!name) {
      warnings.push(`투수 기록 ${r + 1}행: 이름 '${rawName}'을 선수 이름으로 인식하지 못함 — 건너뜀`);
      continue;
    }
    const outs = toInt(row[c.outs]);
    if (outs === null) warnings.push(`투수 기록 ${name}: 아웃 수가 비어 있음 — 0이닝으로 저장`);
    const er = toInt(row[c.er]);
    if (er === null) warnings.push(`투수 기록 ${name}: 자책점 미확정(빈칸) — 0으로 저장되며 ERA에 반영되지 않음`);
    const decision = text(row[c.decision]);
    const ip = Number(formatIP((outs ?? 0) / 3));
    out.push({
      name, decision, ip, outs,
      ha: toInt(row[c.ha]) ?? 0,
      runs_allowed: toInt(row[c.runs]) ?? 0,
      er: er ?? 0,
      bb: toInt(row[c.bb]) ?? 0,
      hbp: toInt(row[c.hbp]) ?? 0,
      so: toInt(row[c.so]) ?? 0,
      hr_allowed: toInt(row[c.hr]) ?? 0,
      batters_faced: 0,
      ab_against: 0,
      pitches: toInt(row[c.pitches]) ?? 0,
      w: decision === "승" ? 1 : 0,
      l: decision === "패" ? 1 : 0,
      sv: decision === "세" ? 1 : 0,
      hld: decision === "홀" ? 1 : 0,
      era: formatRate(computeEra(er ?? 0, ip), 2, "0"),
    });
  }
  return out;
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
export function parseGameWorkbook(workbook: XLSX.WorkBook, fileName: string, fallbackSeason: string): GameSheetParse {
  const warnings: string[] = [];
  const info = parseGameInfo(findSheet(workbook, ["경기 정보", "경기정보"]), warnings);
  const review = parseReview(findSheet(workbook, ["검수"]));

  // 파일명과 경기 정보 대조 — 경기 정보 시트가 있으면 그것을 기준으로 한다
  const meta = extractGameMetaFromFilename(fileName, info.season ?? fallbackSeason);
  if (info.date && meta.date && info.date !== meta.date) {
    warnings.push(`파일명 날짜(${meta.date})와 경기 정보 날짜(${info.date})가 다릅니다 — 경기 정보 날짜로 저장합니다.`);
  }
  if (info.opponent && meta.opponent && norm(info.opponent) !== norm(meta.opponent)) {
    warnings.push(`파일명 상대팀(${meta.opponent})과 경기 정보 상대팀(${info.opponent})이 다릅니다 — 경기 정보 기준으로 저장합니다.`);
  }
  if (!info.date && meta.date) {
    warnings.push(`경기 정보 시트에 날짜가 없어 파일명 날짜(${meta.date})로 저장합니다.`);
  }
  info.date = info.date ?? meta.date ?? null;
  info.opponent = info.opponent ?? meta.opponent ?? null;
  info.season = info.date ? info.date.slice(0, 4) : meta.season ?? fallbackSeason;

  const battingSheet = findOfficialGameSheet(workbook, "batting");
  const pitchingSheet = findOfficialGameSheet(workbook, "pitching");
  const rowsOf = (s?: XLSX.WorkSheet) => (s ? (XLSX.utils.sheet_to_json(s, { header: 1, defval: "" }) as Row[]) : []);

  const v3Batting = parseBattingV3(rowsOf(battingSheet), warnings);
  const v3Pitching = parsePitchingV3(rowsOf(pitchingSheet), warnings);
  const format = v3Batting || v3Pitching ? "v3" : "legacy";

  const batting: GameBattingEntry[] =
    v3Batting ?? (battingSheet ? parseOfficialGameBattingSheet(battingSheet) : []).map((b) => ({ ...b, sf: null, sh: null, ci: null }));
  const pitching: GamePitchingEntry[] =
    v3Pitching ?? (pitchingSheet ? parseOfficialGamePitchingSheet(pitchingSheet) : []).map((p) => ({ ...p, outs: null }));

  // 기록지 검수와 같은 대조 (검수 시트를 안 채웠어도 확인되도록)
  if (format === "v3") {
    if (review.status && review.status !== "검수 완료") {
      warnings.push(`검수 시트 상태: ${review.status}${review.pending.length ? ` — ${review.pending.join(", ")}` : ""}`);
    } else if (!review.status) {
      warnings.push("검수 시트를 찾지 못했거나 검수 요약이 비어 있습니다.");
    }
    const runs = batting.reduce((s, b) => s + b.runs, 0);
    if (info.scoreUs !== null && runs !== info.scoreUs) warnings.push(`우리 점수 ${info.scoreUs} ≠ 타자 득점 합 ${runs}`);
    const allowed = pitching.reduce((s, p) => s + p.runs_allowed, 0);
    if (info.scoreThem !== null && allowed !== info.scoreThem) warnings.push(`상대 점수 ${info.scoreThem} ≠ 투수 실점 합 ${allowed}`);
    const outs = pitching.reduce((s, p) => s + (p.outs ?? 0), 0);
    if (info.defenseOuts !== null && outs !== info.defenseOuts) {
      warnings.push(`수비 아웃 ${info.defenseOuts} ≠ 투수 아웃 합 ${outs}`);
    }
    if (info.eraBase !== null && info.eraBase !== ERA_BASE_INNINGS) {
      warnings.push(`기록지 ERA 기준 이닝이 ${info.eraBase}입니다. 플랫폼은 ${ERA_BASE_INNINGS}이닝 기준으로 계산합니다.`);
    }
  }

  return {
    format,
    info,
    batting,
    pitching,
    highlights: parseOfficialGameHighlights(findOfficialGameSheet(workbook, "highlights")),
    review,
    warnings,
  };
}
