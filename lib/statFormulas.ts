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
