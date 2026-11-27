/**
 * /records 표의 줄. 값은 모두 조회 함수(rank)에서 오고, 여기서는 표에 맞게 늘어놓기만 한다.
 *
 * 줄 순서는 기존 화면과 같게 둔다.
 *  - 타자: OPS 높은 순. OPS가 없는 선수("---")는 0으로 본다.
 *  - 투수: ERA 낮은 순. ERA가 없거나 0.00인 투수는 맨 뒤(기존 화면이 `parseFloat(era) || 99`로 정렬해 왔다).
 *  - 동률은 집계에 들어온 순서.
 */
import { displayMetric, type BattingTotals, type PitchingTotals } from "@/lib/metrics";
import type { MetricPlayer, MetricQuery } from "@/lib/metrics/query";

export type RecordsBattingRow = BattingTotals & {
  seq: number;
  player: MetricPlayer;
  player_id: number;
  avg: string;
  obp: string;
  ops: string;
  opsNum: number;
};

export type RecordsPitchingRow = Omit<PitchingTotals, "innings"> & {
  seq: number;
  player: MetricPlayer;
  /** 야구식 표기 ("46.2") */
  ip: string;
  era: string;
  whip: string;
  eraNum: number;
};

export function buildRecordsTables(query: MetricQuery, season: string) {
  const batting: RecordsBattingRow[] = query
    .rank("OPS", season)
    .entries.map((entry) => {
      const totals = entry.totals as BattingTotals;
      return {
        ...totals,
        seq: entry.seq,
        player: entry.player,
        player_id: entry.player.id,
        avg: displayMetric("AVG", totals),
        obp: displayMetric("OBP", totals),
        ops: entry.display,
        opsNum: parseFloat(entry.display) || 0,
      };
    })
    .sort((a, b) => b.opsNum - a.opsNum || a.seq - b.seq);

  const pitching: RecordsPitchingRow[] = query
    .rank("ERA", season)
    .entries.map((entry) => {
      const { innings, ...totals } = entry.totals as PitchingTotals;
      void innings;
      return {
        ...totals,
        seq: entry.seq,
        player: entry.player,
        ip: displayMetric("IP", entry.totals as PitchingTotals),
        era: entry.display,
        whip: displayMetric("WHIP", entry.totals as PitchingTotals),
        eraNum: parseFloat(entry.display) || 99,
      };
    })
    .sort((a, b) => a.eraNum - b.eraNum || a.seq - b.seq);

  return { batting, pitching };
}
