import { describe, expect, it } from "vitest";
import { selectEffectiveStatRows } from "@/lib/statRows";

type Row = { id: number; player_id: number; season: string; game_id: number | null; ip: number };

describe("selectEffectiveStatRows", () => {
  it("경기별 행이 있는 선수·시즌은 요약 행을 버린다 (2026 이중 집계)", () => {
    const rows: Row[] = [
      { id: 1, player_id: 83, season: "2026", game_id: 27, ip: 1.0 },
      { id: 2, player_id: 83, season: "2026", game_id: 28, ip: 3.0 },
      { id: 3, player_id: 83, season: "2026", game_id: null, ip: 1.0 },
      { id: 4, player_id: 83, season: "2026", game_id: null, ip: 3.0 },
    ];
    expect(selectEffectiveStatRows(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it("경기별 행이 없는 시즌은 요약 행을 그대로 쓴다", () => {
    const rows: Row[] = [
      { id: 1, player_id: 1, season: "2023", game_id: null, ip: 46.2 },
      { id: 2, player_id: 1, season: "2026", game_id: 5, ip: 2 },
    ];
    expect(selectEffectiveStatRows(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it("다른 선수의 행에는 영향이 없다", () => {
    const rows: Row[] = [
      { id: 1, player_id: 1, season: "2026", game_id: 5, ip: 2 },
      { id: 2, player_id: 2, season: "2026", game_id: null, ip: 4 },
    ];
    expect(selectEffectiveStatRows(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it("null/빈 입력을 안전하게 처리한다", () => {
    expect(selectEffectiveStatRows(null)).toEqual([]);
    expect(selectEffectiveStatRows(undefined)).toEqual([]);
  });
});
