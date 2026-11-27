/**
 * AI 분석에 넣는 숫자의 근거 목록.
 *
 * AI 분석 경로는 숫자를 직접 계산하지 않는다. 조회 함수에서 값을 받아 프롬프트에 넣고,
 * 어떤 지표 코드·값을 썼는지 이 목록으로 함께 돌려준다(리포트의 근거 표시용).
 */
import { requireMetric } from "@/lib/metrics";
import type { MetricQuery, MetricTarget, QueryOptions } from "@/lib/metrics/query";

export type MetricEvidence = {
  code: string;
  name: string;
  season: string;
  /** "team" 또는 "player:<id>" */
  target: string;
  value: number | null;
  display: string;
};

export function createEvidenceCollector(query: MetricQuery, lang: "ko" | "en" = "ko") {
  const list: MetricEvidence[] = [];

  /** 값을 조회해 근거 목록에 적고, 프롬프트에 넣을 표기를 돌려준다. 값이 없으면 fallback. */
  function cite(target: MetricTarget, code: string, season: string, options: QueryOptions & { fallback?: string } = {}): string {
    const metric = requireMetric(code);
    const result = query.point(target, metric.code, season, { scope: options.scope });
    const display = result.value === null && options.fallback !== undefined ? options.fallback : result.display;
    list.push({
      code: metric.code,
      name: lang === "ko" ? metric.nameKo : metric.nameEn,
      season,
      target: "team" in target ? "team" : `player:${target.player}`,
      value: result.value,
      display,
    });
    return display;
  }

  return { cite, list };
}
