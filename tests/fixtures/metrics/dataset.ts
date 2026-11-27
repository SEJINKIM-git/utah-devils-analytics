/**
 * 조회 함수 테스트용 가상 기록. 실제 선수 이름을 쓰지 않는다(가선수·나선수…).
 *
 * 일부러 넣은 상황
 *  - 2023: 시즌 요약 행만 있다 (sf 없음 → 출루율 분모는 타석)
 *  - 2026: 경기별 행(v3.0, sf 있음) + 같은 값의 요약 행(이중 집계 대상)
 *  - 가선수는 선수 레코드가 둘이다 (id 1, 11 — 같은 배번·이름)
 *  - 2026 명단은 3월 10일에 올라왔다. 그 전에 만든 경기(100)는 명단 기준 집계에서 빠진다
 *  - 다선수는 2026 명단에 없다
 *  - 라선수는 명단 등록용 0 행만 있다
 */
import type { MetricDataset } from "@/lib/metrics/query";

const bat = (
  id: number, player_id: number, season: string, game_id: number | null,
  v: Partial<Record<"pa" | "ab" | "runs" | "hits" | "doubles" | "triples" | "hr" | "rbi" | "bb" | "hbp" | "so" | "sb", number>>,
  sf: number | null
) => ({
  id, player_id, season, game_id,
  pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, hbp: 0, so: 0, sb: 0,
  ...v, sf,
});

const pit = (
  id: number, player_id: number, season: string, game_id: number | null, ip: number,
  v: Partial<Record<"w" | "l" | "sv" | "hld" | "ha" | "runs_allowed" | "er" | "bb" | "hbp" | "so" | "hr_allowed", number>>
) => ({
  id, player_id, season, game_id, ip,
  w: 0, l: 0, sv: 0, hld: 0, ha: 0, runs_allowed: 0, er: 0, bb: 0, hbp: 0, so: 0, hr_allowed: 0,
  ...v,
});

export const metricsFixture: MetricDataset = {
  players: [
    { id: 1, number: 7, name: "가선수", is_pitcher: false },
    { id: 2, number: 18, name: "나선수", is_pitcher: true },
    { id: 3, number: 21, name: "다선수", is_pitcher: false },
    { id: 4, number: 30, name: "라선수", is_pitcher: false },
    { id: 11, number: 7, name: "가선수", is_pitcher: false },
  ],
  games: [
    { id: 100, season: "2026", created_at: "2026-03-01T10:00:00Z", date: "2026-02-28", opponent: "상대A" },
    { id: 101, season: "2026", created_at: "2026-03-15T10:00:00Z", date: "2026-03-14", opponent: "상대B" },
    { id: 102, season: "2026", created_at: "2026-03-22T10:00:00Z", date: "2026-03-21", opponent: "상대C" },
  ],
  rosterUploads: [
    {
      filename: "2026 roster.xlsx",
      source: "file",
      uploaded_at: "2026-03-10T00:00:00Z",
      players_snapshot: JSON.stringify({
        season: "2026",
        players: [
          { number: 7, name: "가선수" },
          { number: 18, name: "나선수", is_pitcher: true },
          { number: 30, name: "라선수" },
        ],
      }),
    },
  ],
  activatedSeasons: ["2026"],
  lockedSeasons: [],
  batting: [
    // 2023 — 시즌 요약 행
    bat(1, 1, "2023", null, { pa: 20, ab: 16, hits: 6, doubles: 1, hr: 1, rbi: 5, runs: 4, bb: 3, hbp: 1, so: 4, sb: 2 }, null),
    bat(2, 3, "2023", null, { pa: 10, ab: 9, hits: 2, bb: 1, so: 3 }, null),
    bat(3, 2, "2023", null, { pa: 6, ab: 5, hits: 1, bb: 1, so: 2 }, null),
    // 2026 — 경기별 행 (v3.0)
    bat(10, 1, "2026", 100, { pa: 4, ab: 3, hits: 1, bb: 1 }, 0),
    bat(11, 1, "2026", 101, { pa: 5, ab: 3, hits: 2, doubles: 1, bb: 1, rbi: 2, runs: 1 }, 1),
    bat(12, 11, "2026", 102, { pa: 4, ab: 4, hits: 1, hr: 1, so: 2, rbi: 1, runs: 1 }, 0),
    bat(13, 2, "2026", 101, { pa: 3, ab: 2, bb: 1, so: 1 }, 0),
    bat(14, 3, "2026", 101, { pa: 4, ab: 4, hits: 3 }, 0),
    // 2026 — 경기별 행과 같은 값이 한 번 더 들어간 요약 행 (버려야 한다)
    bat(20, 1, "2026", null, { pa: 9, ab: 6, hits: 3, doubles: 1, bb: 2, rbi: 2, runs: 1 }, null),
    // 명단 등록용 0 행
    bat(21, 4, "2026", null, {}, null),
    // 통산 시트 값 — 집계에 쓰지 않는다
    bat(30, 1, "Career", null, { pa: 999, ab: 999, hits: 999 }, null),
  ],
  pitching: [
    pit(1, 2, "2023", null, 46.2, { er: 37, ha: 66, bb: 42, hbp: 4, so: 30, w: 3, l: 4, runs_allowed: 45 }),
    pit(10, 2, "2026", 100, 2, { er: 3, ha: 4, bb: 2, so: 1, l: 1, runs_allowed: 3 }),
    pit(11, 2, "2026", 101, 3.1, { er: 2, ha: 4, bb: 1, so: 4, w: 1, runs_allowed: 2 }),
    pit(12, 2, "2026", 102, 1.2, { er: 0, ha: 1, bb: 2, so: 2, sv: 1 }),
    pit(13, 1, "2026", 102, 0.1, { so: 1 }),
    pit(20, 2, "2026", null, 7, { er: 5, ha: 9, bb: 5, so: 7, w: 1, l: 1, sv: 1, runs_allowed: 5 }),
  ],
};
