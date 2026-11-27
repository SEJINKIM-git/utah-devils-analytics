/**
 * 지표 사전 (블룸버그의 필드 사전에 해당).
 *
 * 코드·이름·공식·표시 형식의 원본은 registry.json 하나다. 이 파일은 그 사전을 읽어
 *  - 코드 → 기존 계산 함수(lib/statFormulas.ts)로 연결하고
 *  - 값을 화면 표기로 바꾼다.
 * 계산식을 여기서 새로 쓰지 않는다. 콘솔(Python)은 console/core/metrics.py가 같은 JSON을 읽는다.
 */
import registry from "./registry.json";
import { formatIP } from "@/lib/statFormatting";
import {
  ERA_BASE_INNINGS,
  computeAvg,
  computeObp,
  computeOps,
  computeSlg,
  eraFromInnings,
  perBaseInnings,
  whipFromInnings,
} from "@/lib/statFormulas";

export type MetricKind = "batting" | "pitching";
export type MetricType = "rate" | "count" | "innings";
export type MetricLang = "ko" | "en";

export type MetricDef = {
  code: string;
  nameKo: string;
  nameEn: string;
  kind: MetricKind;
  type: MetricType;
  summaryKo: string;
  summaryEn: string;
  formulaKo: string;
  formulaEn: string;
  noteKo?: string;
  noteEn?: string;
  /** 표 머리글용 짧은 이름. 없으면 nameKo / code */
  shortKo?: string;
  shortEn?: string;
  /** count 지표가 더하는 합계 칸 */
  fields?: string[];
  digits: number;
  leadingZero: boolean;
  higherIsBetter: boolean | null;
  aliases: string[];
};

/** 선수·팀 단위로 합산된 타격 기록. obp_den은 행마다 정한 출루율 분모의 합이다. */
export type BattingTotals = {
  g: number;
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
  obp_den: number;
};

/** 선수·팀 단위로 합산된 투구 기록. innings는 아웃 수로 더한 실제 이닝(46⅔ = 46.667)이다. */
export type PitchingTotals = {
  g: number;
  w: number;
  l: number;
  sv: number;
  hld: number;
  innings: number;
  ha: number;
  runs_allowed: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr_allowed: number;
};

export type MetricTotals = BattingTotals | PitchingTotals;

export const METRICS: readonly MetricDef[] = registry.metrics as MetricDef[];
export const METRIC_BASE_INNINGS: number = registry.baseInnings;

const BY_CODE = new Map(METRICS.map((metric) => [metric.code.toUpperCase(), metric]));

export function getMetric(code: string): MetricDef | null {
  return BY_CODE.get(String(code ?? "").trim().toUpperCase()) ?? null;
}

export function requireMetric(code: string): MetricDef {
  const metric = getMetric(code);
  if (!metric) throw new Error(`지표 사전에 없는 코드: ${code}`);
  return metric;
}

export function metricsOfKind(kind: MetricKind): MetricDef[] {
  return METRICS.filter((metric) => metric.kind === kind);
}

// ── 이름 ─────────────────────────────────────────────────────────────────────
export function metricName(code: string, lang: MetricLang): string {
  const metric = requireMetric(code);
  return lang === "ko" ? metric.nameKo : metric.nameEn;
}

/** 표 머리글용 짧은 이름: 한국어는 "출루율", 영어는 "OBP" */
export function metricShortName(code: string, lang: MetricLang): string {
  const metric = requireMetric(code);
  return lang === "ko" ? metric.shortKo ?? metric.nameKo : metric.shortEn ?? metric.code;
}

/** lib/translations.ts가 쓰는 { ko, en } 묶음 */
export function metricLabel(code: string): { ko: string; en: string } {
  return { ko: metricShortName(code, "ko"), en: metricShortName(code, "en") };
}

// ── 계산: 코드 → 기존 함수 ────────────────────────────────────────────────────
type RateFn<T> = (totals: T) => number | null;

const BATTING_RATES: Record<string, RateFn<BattingTotals>> = {
  AVG: (t) => computeAvg(t),
  OBP: (t) => computeObp(t),
  SLG: (t) => computeSlg(t),
  OPS: (t) => computeOps(t),
};

const PITCHING_RATES: Record<string, RateFn<PitchingTotals>> = {
  ERA: (t) => eraFromInnings(t.er, t.innings),
  WHIP: (t) => whipFromInnings(t.ha, t.bb, t.innings),
  [`K${ERA_BASE_INNINGS}`]: (t) => perBaseInnings(t.so, t.innings),
  [`BB${ERA_BASE_INNINGS}`]: (t) => perBaseInnings(t.bb, t.innings),
};

/** 사전의 코드가 계산 함수(또는 합계 칸)에 연결돼 있는지 — 테스트가 모든 코드에 대해 확인한다 */
export function isMetricComputable(code: string): boolean {
  const metric = getMetric(code);
  if (!metric) return false;
  if (metric.type === "innings") return metric.kind === "pitching";
  if (metric.type === "count") {
    const sample: Record<string, number> = metric.kind === "batting" ? { ...EMPTY_BATTING } : { ...EMPTY_PITCHING };
    return Boolean(metric.fields?.length) && metric.fields!.every((field) => field in sample);
  }
  return metric.code in (metric.kind === "batting" ? BATTING_RATES : PITCHING_RATES);
}

export const EMPTY_BATTING: BattingTotals = {
  g: 0, pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0, obp_den: 0,
};

export const EMPTY_PITCHING: PitchingTotals = {
  g: 0, w: 0, l: 0, sv: 0, hld: 0, innings: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, hbp: 0, so: 0, hr_allowed: 0,
};

/** 합산된 기록에서 지표 값 하나를 계산한다. 계산할 수 없으면(타수 0, 이닝 0) null. */
export function computeMetric(code: string, totals: MetricTotals): number | null {
  const metric = requireMetric(code);
  if (metric.type === "innings") return (totals as PitchingTotals).innings;
  if (metric.type === "count") {
    const record = totals as unknown as Record<string, number>;
    return (metric.fields ?? []).reduce((sum, field) => sum + (Number(record[field]) || 0), 0);
  }
  if (metric.kind === "batting") return BATTING_RATES[metric.code](totals as BattingTotals);
  return PITCHING_RATES[metric.code](totals as PitchingTotals);
}

// ── 표기 ─────────────────────────────────────────────────────────────────────
/**
 * 분석 플랫폼은 지금까지 비율을 "0.333"처럼 앞자리 0을 붙여 보여 왔다(콘솔은 ".333").
 * 사전의 leadingZero로 통일할지는 사용자 결정 사항이라, 그때까지 화면 표기를 바꾸지 않도록 여기서 한 번에 잡는다.
 * false로 바꾸면 모든 화면이 사전의 leadingZero를 따른다.
 */
export const WEB_KEEPS_LEADING_ZERO = true;

export const METRIC_FALLBACK = "---";

export function formatMetric(
  code: string,
  value: number | null | undefined,
  options: { fallback?: string; leadingZero?: boolean } = {}
): string {
  const metric = requireMetric(code);
  if (value === null || value === undefined || !Number.isFinite(value)) return options.fallback ?? METRIC_FALLBACK;
  if (metric.type === "innings") return formatIP(value);
  if (metric.type === "count") return String(value);
  const text = value.toFixed(metric.digits);
  const keepZero = options.leadingZero ?? (WEB_KEEPS_LEADING_ZERO || metric.leadingZero);
  return !keepZero && text.startsWith("0.") ? text.slice(1) : text;
}

/**
 * 화면에 보이는 값. 기존 화면이 OPS를 "표시된 출루율 + 표시된 장타율"로 보여 왔기 때문에
 * (소수 셋째 자리에서 0.001 차이가 날 수 있다) 그 규칙을 그대로 지킨다. 나머지는 계산값을 표기만 한다.
 */
export function displayMetric(code: string, totals: MetricTotals, options: { fallback?: string } = {}): string {
  const metric = requireMetric(code);
  if (metric.code === "OPS") {
    const obp = computeMetric("OBP", totals);
    const slg = computeMetric("SLG", totals);
    if (obp === null || slg === null) return options.fallback ?? METRIC_FALLBACK;
    return formatMetric("OPS", Number(obp.toFixed(3)) + Number(slg.toFixed(3)), options);
  }
  return formatMetric(code, computeMetric(code, totals), options);
}

// ── 검색 ─────────────────────────────────────────────────────────────────────
const normalizeTerm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const BY_TERM = (() => {
  const map = new Map<string, MetricDef>();
  for (const metric of METRICS) {
    for (const term of [metric.code, ...metric.aliases]) map.set(normalizeTerm(term), metric);
  }
  return map;
})();

/** 코드나 별칭이 정확히 일치하는 지표 ("출루" → OBP) */
export function findMetricByTerm(term: string): MetricDef | null {
  return BY_TERM.get(normalizeTerm(String(term ?? ""))) ?? null;
}

/** 이름·별칭·코드에 검색어가 들어 있는 지표 목록 (검색 팔레트용). 정확히 일치하는 것이 먼저 온다. */
export function searchMetrics(term: string): MetricDef[] {
  const needle = normalizeTerm(String(term ?? ""));
  if (!needle) return [];
  const exact = findMetricByTerm(needle);
  const partial = METRICS.filter(
    (metric) =>
      metric !== exact &&
      [metric.code, metric.nameKo, metric.nameEn, ...metric.aliases].some((candidate) =>
        normalizeTerm(candidate).includes(needle)
      )
  );
  return exact ? [exact, ...partial] : partial;
}
