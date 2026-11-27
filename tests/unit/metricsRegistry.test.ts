/**
 * 지표 사전(lib/metrics/registry.json).
 *  - 모든 코드가 계산 함수에 연결돼 있는지
 *  - 사전을 거친 계산이 숫자 계약(stat-cases.json)과 맞는지
 *  - 코드·별칭이 겹치지 않는지
 * 콘솔(Python) 쪽 짝은 console/tests/test_metrics.py.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_BATTING,
  EMPTY_PITCHING,
  METRICS,
  METRIC_BASE_INNINGS,
  computeMetric,
  displayMetric,
  findMetricByTerm,
  formatMetric,
  getMetric,
  isMetricComputable,
  metricShortName,
  searchMetrics,
  type BattingTotals,
  type PitchingTotals,
} from "@/lib/metrics";
import { ERA_BASE_INNINGS, inningsDecimal, obpDenominator, sumInnings } from "@/lib/statFormulas";
import { t } from "@/lib/translations";

const cases = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/contracts/stat-cases.json"), "utf8"));
const tol = cases.tolerance as number;
const close = (got: number | null, want: number | null, label: string) => {
  if (want === null) expect(got, label).toBeNull();
  else expect(got, label).toBeCloseTo(want, -Math.log10(tol));
};

type BatCaseRow = { hits: number; ab: number; pa: number; bb: number; hbp: number; doubles: number; triples: number; hr: number; sf: number | null };
const batTotals = (row: BatCaseRow): BattingTotals => ({
  ...EMPTY_BATTING,
  hits: row.hits, ab: row.ab, pa: row.pa, bb: row.bb, hbp: row.hbp, doubles: row.doubles, triples: row.triples, hr: row.hr,
  obp_den: obpDenominator(row),
});

describe("지표 사전: 구조", () => {
  it("화면에 나오는 지표가 모두 들어 있다", () => {
    const codes = METRICS.map((metric) => metric.code);
    for (const code of ["AVG", "OBP", "SLG", "OPS", "PA", "AB", "H", "2B", "3B", "HR", "RBI", "R", "BB", "HBP", "SO", "SB"]) {
      expect(codes, code).toContain(code);
      expect(getMetric(code)?.kind, code).toBe("batting");
    }
    for (const code of ["ERA", "WHIP", "IP", "W", "L", "SV", "HLD", "K", "BBA", "HA", "ER", "RA", "HRA", "K5", "BB5"]) {
      expect(codes, code).toContain(code);
      expect(getMetric(code)?.kind, code).toBe("pitching");
    }
  });

  it("모든 코드가 계산 함수(또는 합계 칸)에 연결돼 있다", () => {
    for (const metric of METRICS) {
      expect(isMetricComputable(metric.code), metric.code).toBe(true);
      const totals = metric.kind === "batting" ? EMPTY_BATTING : EMPTY_PITCHING;
      expect(() => computeMetric(metric.code, totals), metric.code).not.toThrow();
    }
  });

  it("코드가 겹치지 않는다", () => {
    const codes = METRICS.map((metric) => metric.code.toUpperCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("코드·별칭이 다른 지표와 겹치지 않는다", () => {
    const owner = new Map<string, string>();
    for (const metric of METRICS) {
      const terms = new Set([metric.code.toLowerCase(), ...metric.aliases.map((alias) => alias.toLowerCase())]);
      for (const term of terms) {
        expect(owner.get(term), `'${term}' (${metric.code})`).toBeUndefined();
        owner.set(term, metric.code);
      }
    }
  });

  it("필수 항목이 채워져 있다", () => {
    for (const metric of METRICS) {
      for (const key of ["nameKo", "nameEn", "summaryKo", "summaryEn", "formulaKo", "formulaEn"] as const) {
        expect(metric[key], `${metric.code}.${key}`).toBeTruthy();
      }
      expect(["batting", "pitching"]).toContain(metric.kind);
      expect(["rate", "count", "innings"]).toContain(metric.type);
      expect(Number.isInteger(metric.digits) && metric.digits >= 0, metric.code).toBe(true);
      expect(metric.aliases.length, metric.code).toBeGreaterThan(0);
    }
  });

  it("기준 이닝이 계산 함수와 같다", () => {
    expect(METRIC_BASE_INNINGS).toBe(ERA_BASE_INNINGS);
    expect(getMetric(`K${ERA_BASE_INNINGS}`)).not.toBeNull();
    expect(getMetric(`BB${ERA_BASE_INNINGS}`)).not.toBeNull();
  });
});

describe("지표 사전: 숫자 계약 (stat-cases.json)", () => {
  for (const c of cases.pitching) {
    it(`투수 — ${c.label}`, () => {
      const totals: PitchingTotals = { ...EMPTY_PITCHING, innings: inningsDecimal(c.ip), er: c.er, ha: c.ha, bb: c.bb, hbp: c.hbp, so: c.so };
      close(computeMetric("ERA", totals), c.era, "ERA");
      close(computeMetric("WHIP", totals), c.whip, "WHIP");
      close(computeMetric("K5", totals), c.k_per_base, "K/5");
      expect(computeMetric("K", totals)).toBe(c.so);
      expect(computeMetric("BBA", totals)).toBe(c.bb);
    });
  }

  for (const c of cases.batting) {
    it(`타격 — ${c.label}`, () => {
      const totals = batTotals(c.row);
      close(computeMetric("AVG", totals), c.avg, "AVG");
      close(computeMetric("OBP", totals), c.obp, "OBP");
      close(computeMetric("SLG", totals), c.slg, "SLG");
      close(computeMetric("OPS", totals), c.ops, "OPS");
      expect(computeMetric("H", totals)).toBe(c.row.hits);
      expect(computeMetric("BBHBP", totals)).toBe(c.row.bb + c.row.hbp);
    });
  }

  it(cases.batting_aggregate.label, () => {
    const rows = cases.batting_aggregate.rows as BatCaseRow[];
    const totals = rows.map(batTotals).reduce((a, b) => {
      const out = { ...a };
      for (const key of Object.keys(a) as Array<keyof BattingTotals>) out[key] = a[key] + b[key];
      return out;
    });
    expect(totals.obp_den).toBe(cases.batting_aggregate.obp_den);
    close(computeMetric("AVG", totals), cases.batting_aggregate.avg, "AVG");
    close(computeMetric("OBP", totals), cases.batting_aggregate.obp, "OBP");
    close(computeMetric("SLG", totals), cases.batting_aggregate.slg, "SLG");
    close(computeMetric("OPS", totals), cases.batting_aggregate.ops, "OPS");
  });

  for (const c of cases.innings) {
    it(`이닝 — ${c.label}`, () => {
      const totals: PitchingTotals = { ...EMPTY_PITCHING, innings: sumInnings(c.values) };
      expect(Math.round((computeMetric("IP", totals) ?? 0) * 3)).toBe(c.outs);
      if (c.notation) expect(formatMetric("IP", computeMetric("IP", totals))).toBe(c.notation);
    });
  }
});

describe("지표 사전: 표기", () => {
  it("사전의 자릿수를 따른다", () => {
    expect(formatMetric("OBP", 0.4280155)).toBe("0.428");
    expect(formatMetric("ERA", 3.9642857)).toBe("3.96");
    expect(formatMetric("K5", 3.2142857)).toBe("3.2");
    expect(formatMetric("HR", 3)).toBe("3");
    expect(formatMetric("IP", 46 + 2 / 3)).toBe("46.2");
  });

  it("값이 없으면 ---", () => {
    expect(formatMetric("AVG", null)).toBe("---");
    expect(formatMetric("ERA", undefined)).toBe("---");
    expect(formatMetric("AVG", null, { fallback: "0" })).toBe("0");
  });

  it("앞자리 0은 사전 설정으로 뗄 수 있다 (지금 화면은 붙여 둔다)", () => {
    expect(formatMetric("OBP", 0.428, { leadingZero: false })).toBe(".428");
    expect(formatMetric("OPS", 1.013, { leadingZero: false })).toBe("1.013");
    expect(formatMetric("ERA", 0.5, { leadingZero: getMetric("ERA")!.leadingZero })).toBe("0.50");
  });

  it("OPS는 표시된 출루율 + 표시된 장타율 (기존 화면 규칙)", () => {
    // 출루율 0.3335 → 0.334(반올림), 장타율 0.4445 → 0.445: 합 0.779. 반올림 전 합은 0.778
    const totals: BattingTotals = { ...EMPTY_BATTING, ab: 2000, hits: 667, doubles: 222, obp_den: 2000 };
    const obp = displayMetric("OBP", totals);
    const slg = displayMetric("SLG", totals);
    expect(displayMetric("OPS", totals)).toBe((Number(obp) + Number(slg)).toFixed(3));
    expect(displayMetric("OPS", EMPTY_BATTING)).toBe("---");
  });
});

describe("지표 사전: 이름과 검색", () => {
  it("번역 파일의 지표 이름은 사전에서 온다", () => {
    expect(t("batting.obp", "ko")).toBe("출루율");
    expect(t("batting.obp", "en")).toBe("OBP");
    expect(t("pitching.so", "ko")).toBe(metricShortName("K", "ko"));
    expect(t("pitching.sv", "ko")).toBe("세");
    expect(t("batting.doubles", "en")).toBe("2B");
  });

  it("별칭으로 찾는다", () => {
    expect(findMetricByTerm("출루")?.code).toBe("OBP");
    expect(findMetricByTerm("on base")?.code).toBe("OBP");
    expect(findMetricByTerm("방어율")?.code).toBe("ERA");
    expect(findMetricByTerm("obp")?.code).toBe("OBP");
    expect(findMetricByTerm("없는말")).toBeNull();
  });

  it("부분 일치 검색은 정확히 일치하는 것을 먼저 준다", () => {
    expect(searchMetrics("출루").map((metric) => metric.code).slice(0, 1)).toEqual(["OBP"]);
    expect(searchMetrics("삼진").map((metric) => metric.code)).toEqual(expect.arrayContaining(["SO", "K", "K5"]));
    expect(searchMetrics("")).toEqual([]);
  });
});
