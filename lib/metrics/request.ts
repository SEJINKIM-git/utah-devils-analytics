/**
 * GET /api/metrics 쿼리 해석. 순수 함수라 DB 없이 테스트한다.
 */
import { getMetric } from "@/lib/metrics";
import { isSeasonValue } from "@/lib/season";
import type { MetricTarget, QueryScope } from "@/lib/metrics/query";

export type MetricRequest = {
  mode: "point" | "history" | "rank";
  code: string;
  target: MetricTarget;
  season: string;
  by: "game" | "season";
  from?: string;
  to?: string;
  minPa: number;
  minIp: number;
  scope: QueryScope;
};

type Parsed = { ok: true; request: MetricRequest } | { ok: false; error: string };

type ParamSource = { get(name: string): string | null };

export function parseMetricTarget(raw: string | null): MetricTarget | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "team") return { team: true };
  const id = value.startsWith("player:") ? value.slice("player:".length) : value;
  return /^\d+$/.test(id) ? { player: Number(id) } : null;
}

const nonNegative = (raw: string | null) => {
  if (raw === null || raw === "") return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const isBound = (value: string) => /^20\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseMetricRequest(params: ParamSource): Parsed {
  const mode = params.get("mode") ?? "point";
  if (mode !== "point" && mode !== "history" && mode !== "rank") {
    return { ok: false, error: "mode는 point, history, rank 중 하나여야 합니다" };
  }

  const metric = getMetric(params.get("code") ?? "");
  if (!metric) return { ok: false, error: "code가 지표 사전에 없습니다 (GET /api/metrics 로 목록 확인)" };

  const target = parseMetricTarget(params.get("target"));
  if (!target) return { ok: false, error: "target은 team 또는 player:<id> 형식이어야 합니다" };

  const season = (params.get("season") ?? "").trim();
  if (mode !== "history" && !isSeasonValue(season)) {
    return { ok: false, error: "season은 연도(예: 2026) 또는 Career여야 합니다" };
  }

  const by = params.get("by") ?? "season";
  if (by !== "game" && by !== "season") return { ok: false, error: "by는 game 또는 season이어야 합니다" };

  const from = (params.get("from") ?? "").trim() || undefined;
  const to = (params.get("to") ?? "").trim() || undefined;
  if ((from && !isBound(from)) || (to && !isBound(to))) {
    return { ok: false, error: "from, to는 연도(2026) 또는 날짜(2026-03-01)여야 합니다" };
  }

  const minPa = nonNegative(params.get("minPa"));
  const minIp = nonNegative(params.get("minIp"));
  if (minPa === null || minIp === null) return { ok: false, error: "minPa, minIp는 0 이상의 숫자여야 합니다" };

  const scope = params.get("scope") ?? "roster";
  if (scope !== "roster" && scope !== "all") return { ok: false, error: "scope는 roster 또는 all이어야 합니다" };

  return { ok: true, request: { mode, code: metric.code, target, season, by, from, to, minPa, minIp, scope } };
}
