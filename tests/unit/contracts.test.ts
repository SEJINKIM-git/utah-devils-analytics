/**
 * 분석 플랫폼(TS)과 콘솔(Python)의 계산 일치 — tests/fixtures/contracts/stat-cases.json의 기대값을
 * 양쪽이 각자의 함수로 계산해 맞춘다. 콘솔 쪽은 console/tests/test_contracts.py.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeAvg,
  computeEra,
  computeObp,
  computeOps,
  computeSlg,
  computeWhip,
  eraFromInnings,
  inningsDecimal,
  normalizeInningsForStorage,
  obpDenominator,
  perBaseInnings,
  sumInnings,
} from "@/lib/statFormulas";
import { selectEffectiveStatRows } from "@/lib/statRows";
import { formatIP } from "@/lib/statFormatting";

const cases = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/contracts/stat-cases.json"), "utf8"));
const tol = cases.tolerance as number;
const close = (got: number | null, want: number | null, label: string) => {
  if (want === null) expect(got, label).toBeNull();
  else expect(got, label).toBeCloseTo(want, -Math.log10(tol));
};

describe("계약: 이닝", () => {
  for (const c of cases.innings) {
    it(c.label, () => {
      expect(Math.round(sumInnings(c.values) * 3)).toBe(c.outs);
      if (c.notation) expect(formatIP(sumInnings(c.values))).toBe(c.notation);
      if (c.normalized) expect(c.values.map((v: number) => String(normalizeInningsForStorage(v)))).toEqual(c.normalized);
    });
  }
});

describe("계약: 투수 지표", () => {
  for (const c of cases.pitching) {
    it(c.label, () => {
      close(computeEra(c.er, c.ip), c.era, "ERA");
      close(computeWhip(c.ha, c.bb, c.ip), c.whip, "WHIP");
      close(perBaseInnings(c.so, c.ip), c.k_per_base, "K/5");
    });
  }
});

describe("계약: 타격 지표", () => {
  for (const c of cases.batting) {
    it(c.label, () => {
      close(computeAvg(c.row), c.avg, "AVG");
      close(computeObp(c.row), c.obp, "OBP");
      close(computeSlg(c.row), c.slg, "SLG");
      close(computeOps(c.row), c.ops, "OPS");
    });
  }

  it(cases.batting_aggregate.label, () => {
    const rows = cases.batting_aggregate.rows as Array<Record<string, number | null>>;
    const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
    const den = rows.reduce((s, r) => s + obpDenominator(r), 0);
    expect(den).toBe(cases.batting_aggregate.obp_den);
    const merged = { hits: sum("hits"), ab: sum("ab"), bb: sum("bb"), hbp: sum("hbp"), doubles: sum("doubles"), triples: sum("triples"), hr: sum("hr"), obp_den: den };
    close(computeAvg(merged), cases.batting_aggregate.avg, "AVG");
    close(computeObp(merged), cases.batting_aggregate.obp, "OBP");
    close(computeSlg(merged), cases.batting_aggregate.slg, "SLG");
    close(computeOps(merged), cases.batting_aggregate.ops, "OPS");
  });
});

describe("계약: 이중 집계 제거 + 이닝 합산", () => {
  type Row = { id: number; player_id: number; season: string; game_id: number | null; ip: number; er: number };
  it(cases.dedupe.label, () => {
    const effective = selectEffectiveStatRows(cases.dedupe.rows as Row[]);
    expect(effective.map((r) => r.id)).toEqual(cases.dedupe.effective_ids);
    for (const t of cases.dedupe.totals) {
      const mine = effective.filter((r) => r.player_id === t.player_id && r.season === t.season);
      const innings = sumInnings(mine.map((r) => r.ip));
      const er = mine.reduce((s, r) => s + r.er, 0);
      expect(Math.round(innings * 3), `${t.player_id}/${t.season} outs`).toBe(t.outs);
      expect(er).toBe(t.er);
      close(eraFromInnings(er, innings), t.era, `${t.player_id}/${t.season} ERA`);
      expect(inningsDecimal(formatIP(innings))).toBeCloseTo(innings, 6);
    }
  });
});
