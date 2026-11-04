import { type ObpRow, obpDenominator } from "@/lib/statFormulas";

/**
 * 같은 선수·시즌에 "시즌 요약 행(game_id 없음)"과 "경기별 행(game_id 있음)"이 함께 있으면
 * 단순 합산 시 두 번 더해진다. (2026: 경기별 행마다 같은 값의 요약 행이 하나씩 더 있어
 * 투수 이닝이 실제 15이닝 → 30이닝으로 표시되던 문제)
 *
 * 규칙: 선수·시즌 단위로 경기별 행이 하나라도 있으면 그것만 쓰고 요약 행은 버린다.
 * 경기별 행이 없는 시즌(2022~2025 시즌 누적 파일)은 요약 행을 그대로 쓴다.
 * 모든 기록 조회는 합산 전에 이 함수를 거친다.
 */
type StatRowKey = {
  player_id: number | string | null;
  season?: string | null;
  game_id?: number | string | null;
};

export function selectEffectiveStatRows<T extends StatRowKey>(rows: T[] | null | undefined): T[] {
  if (!rows || rows.length === 0) return [];
  const key = (row: T) => `${row.player_id ?? ""}|${String(row.season ?? "").trim()}`;
  const hasGameRows = new Set<string>();
  for (const row of rows) {
    if (row.game_id !== null && row.game_id !== undefined) hasGameRows.add(key(row));
  }
  if (hasGameRows.size === 0) return rows;
  return rows.filter(
    (row) => !hasGameRows.has(key(row)) || (row.game_id !== null && row.game_id !== undefined)
  );
}

/** 타격 행에 출루율 분모(obp_den)를 붙인다. 합산하는 곳에서는 이 값을 더해 출루율을 계산한다. */
export function withObpDenominator<T extends ObpRow>(rows: T[]): Array<T & { obp_den: number }> {
  return rows.map((row) => ({ ...row, obp_den: obpDenominator(row) }));
}

/** 타격 기록 조회용: 이중 집계 제거 + 출루율 분모 */
export function selectEffectiveBattingRows<T extends StatRowKey & ObpRow>(
  rows: T[] | null | undefined
): Array<T & { obp_den: number }> {
  return withObpDenominator(selectEffectiveStatRows(rows));
}
