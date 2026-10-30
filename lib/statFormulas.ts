import { formatIP, parseIP } from "@/lib/statFormatting";

/**
 * 투수 지표 공식의 단일 위치.
 *
 * 이전에는 ERA/WHIP를 10곳 넘게 각자 계산했고
 *  - 대부분 IP 표기(46.2 = 46⅔)를 소수 46.2로 그대로 나눴으며
 *  - 경기 리뷰만 9이닝 기준(×9)이었다.
 * 이제 모든 화면이 이 함수들을 쓴다. 기준 이닝을 바꾸려면 ERA_BASE_INNINGS만 고치면 된다.
 */
export const ERA_BASE_INNINGS = 5;

/** IP 표기(문자열/숫자) → 실제 이닝(소수). 46.2 → 46.667 */
export function inningsDecimal(ip: number | string | null | undefined): number {
  return parseIP(ip);
}

/** 여러 경기 IP 합계 (표기끼리 더하지 않고 실제 이닝으로 더한다: 30.2 + 55.2 = 86.1) */
export function sumInnings(values: Array<number | string | null | undefined>): number {
  const outs = values.reduce<number>((acc, v) => acc + Math.round(inningsDecimal(v) * 3), 0);
  return outs / 3;
}

export function computeEra(er: number, ip: number | string | null | undefined): number | null {
  const innings = inningsDecimal(ip);
  return innings > 0 ? (Number(er || 0) * ERA_BASE_INNINGS) / innings : null;
}

export function computeWhip(hitsAllowed: number, walks: number, ip: number | string | null | undefined): number | null {
  const innings = inningsDecimal(ip);
  return innings > 0 ? (Number(hitsAllowed || 0) + Number(walks || 0)) / innings : null;
}

/** 기준 이닝당 비율 (K/5, BB/5) */
export function perBaseInnings(count: number, ip: number | string | null | undefined): number | null {
  const innings = inningsDecimal(ip);
  return innings > 0 ? (Number(count || 0) * ERA_BASE_INNINGS) / innings : null;
}

export function formatRate(value: number | null | undefined, digits = 2, fallback = "---"): string {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value.toFixed(digits);
}

/**
 * DB 저장용 IP 정규화. 기록지마다 3⅓을 3.1(표기) 또는 3.3(소수)으로 적어서
 * 같은 컬럼에 두 방식이 섞여 있었다 (2026 경기 파일: 3.3, 1.7). 저장은 항상 표기로 통일한다.
 */
export function normalizeInningsForStorage(ip: number | string | null | undefined): number {
  return Number(formatIP(inningsDecimal(ip)));
}

/** 이미 실제 이닝(소수)으로 합산된 값용 — 46.667 같은 값 */
export function eraFromInnings(er: number, innings: number): number | null {
  return innings > 0 ? (Number(er || 0) * ERA_BASE_INNINGS) / innings : null;
}

export function whipFromInnings(hitsAllowed: number, walks: number, innings: number): number | null {
  return innings > 0 ? (Number(hitsAllowed || 0) + Number(walks || 0)) / innings : null;
}

/**
 * 출루율 — 경기 기록지 v3.0 기준: (안타 + 볼넷 + 사구) ÷ (타수 + 볼넷 + 사구 + 희생플라이).
 * 희생번트·포수방해는 분모에서 제외한다.
 *
 * 2022~2025 시즌 누적 파일에는 희생플라이 구분이 없어(sf = null) 기존 방식(÷ 타석)을 유지한다.
 * 그래서 행마다 분모(obp_den)를 정해 두고, 합산할 때도 분모를 따로 더한다.
 */
export type ObpRow = {
  hits?: number | null;
  pa?: number | null;
  ab?: number | null;
  bb?: number | null;
  hbp?: number | null;
  sf?: number | null;
  obp_den?: number | null;
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export function obpDenominator(row: ObpRow): number {
  if (typeof row.obp_den === "number" && Number.isFinite(row.obp_den)) return row.obp_den;
  if (row.sf !== null && row.sf !== undefined) return num(row.ab) + num(row.bb) + num(row.hbp) + num(row.sf);
  return num(row.pa);
}

export function computeObp(row: ObpRow): number | null {
  const den = obpDenominator(row);
  return den > 0 ? (num(row.hits) + num(row.bb) + num(row.hbp)) / den : null;
}

export type SlgRow = {
  hits?: number | null;
  ab?: number | null;
  doubles?: number | null;
  triples?: number | null;
  hr?: number | null;
};

export function computeAvg(row: Pick<SlgRow, "hits" | "ab">): number | null {
  return num(row.ab) > 0 ? num(row.hits) / num(row.ab) : null;
}

/** 장타율 = 루타 ÷ 타수. 루타 = 1루타 + 2×2루타 + 3×3루타 + 4×홈런 */
export function computeSlg(row: SlgRow): number | null {
  const ab = num(row.ab);
  if (ab <= 0) return null;
  const singles = num(row.hits) - num(row.doubles) - num(row.triples) - num(row.hr);
  return (singles + 2 * num(row.doubles) + 3 * num(row.triples) + 4 * num(row.hr)) / ab;
}

export function computeOps(row: ObpRow & SlgRow): number | null {
  const obp = computeObp(row);
  const slg = computeSlg(row);
  return obp === null || slg === null ? null : obp + slg;
}
