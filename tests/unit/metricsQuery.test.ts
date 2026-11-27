/**
 * 조회 함수(lib/metrics/query.ts): point · history · rank.
 *
 * 가상 기록(tests/fixtures/metrics/dataset.ts)으로
 *  - 손으로 계산한 값과 맞는지
 *  - 기존 /records, /players/[id] 화면의 집계 코드(tests/helpers/legacyScreens.ts)와 같은 값을 내는지
 * 확인한다.
 */
import { describe, expect, it } from "vitest";
import { metricsFixture } from "../fixtures/metrics/dataset";
import { legacyPlayerPage, legacyRecords } from "../helpers/legacyScreens";
import { displayMetric, type BattingTotals, type PitchingTotals } from "@/lib/metrics";
import { createMetricQuery, type MetricDataset } from "@/lib/metrics/query";
import { buildRecordsTables } from "@/lib/metrics/recordsTable";
import { parseMetricRequest, parseMetricTarget } from "@/lib/metrics/request";

const query = createMetricQuery(metricsFixture);
const GA = { player: 1 };
const GA_NEW_ID = { player: 11 };
const NA = { player: 2 };
const DA = { player: 3 };
const TEAM = { team: true as const };

/** 새 /records 표를 화면에 찍히는 칸으로 펼친다 (legacyRecords와 같은 모양) */
function recordsAsDisplayed(dataset: MetricDataset, season: string) {
  const tables = buildRecordsTables(createMetricQuery(dataset), season);
  return {
    batting: tables.batting.map((b) => ({
      number: b.player.number, name: b.player.name, playerId: b.player.id, sbPlayerId: b.player_id,
      pa: b.pa, ab: b.ab, hits: b.hits, doubles: b.doubles, triples: b.triples, hr: b.hr, rbi: b.rbi, bb: b.bb, so: b.so, sb: b.sb ?? 0,
      avg: b.avg, obp: b.obp, ops: b.ops,
    })),
    pitching: tables.pitching.map((p) => ({
      number: p.player.number, name: p.player.name,
      w: p.w, l: p.l, sv: p.sv, ip: p.ip, ha: p.ha, er: p.er, bb: p.bb, so: p.so, era: p.era, whip: p.whip,
    })),
  };
}

describe("point — 손 계산", () => {
  it("2026 명단 기준: 중복 선수 레코드를 합치고, 요약 행과 명단 업로드 전 경기를 뺀다", () => {
    // 가선수 = 경기 101(id 1) + 경기 102(id 11). 타수 7, 안타 3, 볼넷 1, 분모 5 + 4 = 9
    expect(query.point(GA, "PA", "2026").value).toBe(9);
    expect(query.point(GA, "AB", "2026").value).toBe(7);
    expect(query.point(GA, "H", "2026").value).toBe(3);
    expect(query.point(GA, "G", "2026").value).toBe(2);
    expect(query.point(GA, "AVG", "2026").display).toBe("0.429");
    expect(query.point(GA, "OBP", "2026").value).toBeCloseTo(4 / 9, 9);
    expect(query.point(GA, "OBP", "2026").display).toBe("0.444");
    expect(query.point(GA, "SLG", "2026").display).toBe("1.000");
    expect(query.point(GA, "OPS", "2026").display).toBe("1.444");
  });

  it("같은 사람의 다른 선수 id로 물어도 같은 값", () => {
    for (const code of ["PA", "OBP", "OPS", "HR"]) {
      expect(query.point(GA_NEW_ID, code, "2026")).toEqual(query.point(GA, code, "2026"));
    }
  });

  it("출루율 분모: v3.0 행은 타수+볼넷+사구+희생플라이, 희생플라이가 없는 과거 행은 타석", () => {
    expect((query.point(GA, "OBP", "2026").totals as BattingTotals).obp_den).toBe(9);
    expect((query.point(GA, "OBP", "2023").totals as BattingTotals).obp_den).toBe(20);
    expect(query.point(GA, "OBP", "2023").display).toBe("0.500"); // (6+3+1) ÷ 20
  });

  it("통산: 과거 시즌 행(sf 없음)과 v3.0 행을 섞어 더한다 — 분모는 행마다 정한 뒤 더한다", () => {
    // 2023 요약(분모 20) + 2026 경기 100·101·102(분모 4 + 5 + 4). 통산은 명단 기준을 적용하지 않는다
    const obp = query.point(GA, "OBP", "Career");
    expect((obp.totals as BattingTotals).obp_den).toBe(33);
    expect(obp.value).toBeCloseTo((10 + 5 + 1) / 33, 9);
    expect(obp.display).toBe("0.485");
    expect(query.point(GA, "AVG", "Career").display).toBe("0.385"); // 10 ÷ 26
    expect(query.point(GA, "PA", "Career").value).toBe(33); // 'Career' 행(999)은 쓰지 않는다
  });

  it("ERA는 자책 × 5 ÷ 이닝, 이닝은 아웃 수로 더한다 (3.1 + 1.2 = 5)", () => {
    expect(query.point(NA, "IP", "2026").display).toBe("5");
    expect(query.point(NA, "IP", "2026").value).toBeCloseTo(5, 9);
    expect(query.point(NA, "ERA", "2026").display).toBe("2.00"); // 2 × 5 ÷ 5
    expect(query.point(NA, "WHIP", "2026").display).toBe("1.60"); // (5 + 3) ÷ 5
    expect(query.point(NA, "K5", "2026").display).toBe("6.0");
    expect(query.point(NA, "ERA", "2023").value).toBeCloseTo(3.9642857142857144, 6); // 46.2이닝 37자책
    expect(query.point(NA, "IP", "2023").display).toBe("46.2");
    // 통산: 46.2 + 2 + 3.1 + 1.2 = 53.2 (표기끼리 더하면 52.5가 된다)
    expect(query.point(NA, "IP", "Career").display).toBe("53.2");
  });

  it("팀 값은 선수 기록을 더해 계산한다", () => {
    expect(query.point(TEAM, "AVG", "2026").display).toBe("0.333"); // 3 ÷ 9
    expect(query.point(TEAM, "OBP", "2026").display).toBe("0.417"); // (3+2) ÷ 12
    expect(query.point(TEAM, "IP", "2026").display).toBe("5.1"); // 5 + 0.1
    expect(query.point(TEAM, "ERA", "2026").value).toBeCloseTo((2 * 5) / (16 / 3), 9);
    expect(query.point(TEAM, "BBHBP", "2026").value).toBe(2);
  });

  it("명단에 없는 선수는 명단 기준에서 빠지고, 범위 all에서는 나온다", () => {
    expect(query.point(DA, "AVG", "2026").totals).toBeNull();
    expect(query.point(DA, "AVG", "2026").display).toBe("---");
    expect(query.point(DA, "H", "2026").display).toBe("0");
    expect(query.point(DA, "AVG", "2026", { scope: "all" }).display).toBe("0.750");
    // 범위 all: 가선수는 명단 업로드 전 경기(100)까지 포함
    expect(query.point(GA, "PA", "2026", { scope: "all" }).value).toBe(13);
  });

  it("기록이 0뿐인 선수(명단 등록용 행)는 집계에 나오지 않는다", () => {
    expect(query.point({ player: 4 }, "PA", "2026", { scope: "all" }).totals).toBeNull();
    expect(query.rank("PA", "2026", { scope: "all" }).entries.map((e) => e.player.name)).not.toContain("라선수");
  });

  it("없는 코드는 오류", () => {
    expect(() => query.point(GA, "NOPE", "2026")).toThrow(/지표 사전에 없는 코드/);
  });
});

describe("rank", () => {
  it("좋은 방향으로 줄 세운다 (OPS는 높은 순, ERA는 낮은 순)", () => {
    const ops = query.rank("OPS", "2026");
    expect(ops.entries.map((e) => [e.rank, e.player.name, e.display])).toEqual([
      [1, "가선수", "1.444"],
      [2, "나선수", "0.333"],
    ]);
    expect(ops.entries[0].player.id).toBe(11); // 가장 최근 선수 레코드
    expect(ops.team.display).toBe("1.195"); // 팀 출루율 0.417(5 ÷ 12) + 팀 장타율 0.778(7 ÷ 9)

    const era = query.rank("ERA", "2026");
    expect(era.entries.map((e) => [e.rank, e.player.name, e.display])).toEqual([
      [1, "가선수", "0.00"],
      [2, "나선수", "2.00"],
    ]);
  });

  it("규정 타석·이닝 미달은 순위를 매기지 않고 뒤로 보낸다", () => {
    const ops = query.rank("OPS", "2026", { minPa: 5 });
    expect(ops.entries.map((e) => [e.rank, e.player.name, e.qualified])).toEqual([
      [1, "가선수", true],
      [null, "나선수", false],
    ]);
    const era = query.rank("ERA", "2026", { minIp: 1 });
    expect(era.entries.map((e) => [e.rank, e.player.name, e.qualified])).toEqual([
      [1, "나선수", true],
      [null, "가선수", false],
    ]);
  });

  it("화면에 같은 숫자로 보이면 공동 순위, 다음 순위는 건너뛴다", () => {
    const hits = query.rank("H", "2023");
    expect(hits.entries.map((e) => [e.rank, e.player.name, e.value])).toEqual([
      [1, "가선수", 6],
      [2, "다선수", 2],
      [3, "나선수", 1],
    ]);
    const tied = createMetricQuery({
      ...metricsFixture,
      batting: metricsFixture.batting.map((row) => (row.id === 3 ? { ...row, hits: 2 } : row)),
    }).rank("H", "2023");
    expect(tied.entries.map((e) => e.rank)).toEqual([1, 2, 2]);
  });

  it("규정 타석·이닝: 기록이 있는 경기 수 × 경기당 기준, 요약 행만 있는 시즌은 기준 없음", () => {
    expect(query.qualification("2026")).toEqual({ games: 2, minPa: 3, minIp: 1 });
    expect(query.qualification("2026", { scope: "all" })).toEqual({ games: 3, minPa: 5, minIp: 2 });
    expect(query.qualification("2023")).toEqual({ games: 0, minPa: 0, minIp: 0 });

    const era = query.rank("ERA", "2026", { qualify: true });
    expect([era.minIp, era.games]).toEqual([1, 2]);
    expect(era.entries.map((e) => [e.rank, e.player.name, e.qualified])).toEqual([
      [1, "나선수", true],
      [null, "가선수", false],
    ]);
    // 직접 적은 값이 먼저다
    expect(query.rank("ERA", "2026", { qualify: true, minIp: 0 }).entries.every((e) => e.qualified)).toBe(true);
    // 적지 않으면 기준 없음 (/records는 모두 보여 준다)
    expect(query.rank("OPS", "2026").minPa).toBe(0);
  });

  it("잠긴 시즌은 비어 있다", () => {
    const locked = createMetricQuery({ ...metricsFixture, activatedSeasons: [], lockedSeasons: ["2026"] });
    expect(locked.rank("OPS", "2026").entries).toEqual([]);
    expect(locked.point(TEAM, "AVG", "2026").display).toBe("---");
    // 통산에서도 잠긴 시즌 기록은 뺀다
    expect(locked.point(GA, "PA", "Career").value).toBe(20);
  });
});

describe("history", () => {
  it("시즌별: 기록이 있는 시즌만, 오래된 순", () => {
    const items = query.history(GA, "OBP", { by: "season", scope: "all" });
    expect(items.map((i) => [i.key, i.display])).toEqual([
      ["2023", "0.500"],
      ["2026", "0.462"], // (4+2) ÷ 13
    ]);
    expect(query.history(GA, "OBP", { by: "season", from: "2024", scope: "all" }).map((i) => i.key)).toEqual(["2026"]);
    expect(query.history(GA, "OBP", { by: "season", to: "2023" }).map((i) => i.key)).toEqual(["2023"]);
  });

  it("경기별: 날짜 순, 경기 정보 포함", () => {
    const items = query.history(GA, "OBP", { by: "game", from: "2026", to: "2026" });
    expect(items.map((i) => [i.key, i.date, i.opponent, i.display])).toEqual([
      ["101", "2026-03-14", "상대B", "0.600"], // (2+1) ÷ 5
      ["102", "2026-03-21", "상대C", "0.250"],
    ]);
    // 범위 all이면 명단 업로드 전 경기도 나온다
    expect(query.history(GA, "OBP", { by: "game", scope: "all" }).map((i) => i.key)).toEqual(["100", "101", "102"]);
    // 날짜로 자르기
    expect(query.history(GA, "OBP", { by: "game", scope: "all", from: "2026-03-01" }).map((i) => i.key)).toEqual(["101", "102"]);
  });

  it("경기별 팀 값은 그 경기의 선수 기록을 더한다", () => {
    const items = query.history(TEAM, "AVG", { by: "game", from: "2026" });
    expect(items.map((i) => [i.key, i.display])).toEqual([
      ["101", "0.400"], // 가선수 2/3 + 나선수 0/2
      ["102", "0.250"],
    ]);
    const era = query.history(TEAM, "ERA", { by: "game", from: "2026" });
    expect(era.map((i) => [i.key, i.display])).toEqual([
      ["101", "3.00"], // 2 × 5 ÷ 3⅓
      ["102", "0.00"],
    ]);
  });

  it("시즌별 합계는 경기별 합계와 맞는다", () => {
    const games = query.history(NA, "K", { by: "game", from: "2026" });
    const total = games.reduce((sum, item) => sum + (item.value ?? 0), 0);
    expect(total).toBe(query.point(NA, "K", "2026").value);
  });
});

describe("기존 화면과 같은 값", () => {
  const seasons = ["2026", "2023", "Career", "2025"];

  for (const season of seasons) {
    it(`/records ${season}: 표의 모든 칸과 줄 순서가 같다`, () => {
      expect(recordsAsDisplayed(metricsFixture, season)).toEqual(legacyRecords(metricsFixture, season));
    });
  }

  it("/records: 명단이 없는 시즌 구성, 동률, 0.00 ERA, 값 없는 선수가 섞여도 같다", () => {
    const variant: MetricDataset = {
      ...metricsFixture,
      rosterUploads: [],
      batting: [
        ...metricsFixture.batting,
        // 타수 0(볼넷만) → 타율·OPS "---", 그리고 OPS 0.000인 타자
        { ...metricsFixture.batting[0], id: 900, player_id: 4, season: "2026", game_id: 101, pa: 2, ab: 0, hits: 0, doubles: 0, hr: 0, rbi: 0, runs: 0, bb: 2, hbp: 0, so: 0, sb: 0, sf: 0 },
        { ...metricsFixture.batting[0], id: 901, player_id: 3, season: "2026", game_id: 102, pa: 3, ab: 3, hits: 0, doubles: 0, hr: 0, rbi: 0, runs: 0, bb: 0, hbp: 0, so: 3, sb: 0, sf: 0 },
      ],
      pitching: [
        ...metricsFixture.pitching,
        { ...metricsFixture.pitching[0], id: 902, player_id: 3, season: "2026", game_id: 102, ip: 0, er: 1, ha: 2, bb: 1, hbp: 0, so: 0, w: 0, l: 0, runs_allowed: 1 },
      ],
    };
    for (const season of ["2026", "2023", "Career"]) {
      expect(recordsAsDisplayed(variant, season), season).toEqual(legacyRecords(variant, season));
    }
  });

  it("/players/[id]: 경기별 기록이 있는 시즌의 큰 숫자와 합계가 같다", () => {
    for (const [target, id] of [[GA, 1], [GA_NEW_ID, 11], [NA, 2]] as const) {
      const legacy = legacyPlayerPage(metricsFixture, id, "2026");
      if (legacy.bat) {
        expect(query.point(target, "AVG", "2026").display).toBe(legacy.avg);
        expect(query.point(target, "OBP", "2026").display).toBe(legacy.obp);
        expect(query.point(target, "SLG", "2026").display).toBe(legacy.slg);
        expect(query.point(target, "OPS", "2026").display).toBe(legacy.ops);
        for (const [code, field] of [["PA", "pa"], ["AB", "ab"], ["H", "hits"], ["2B", "doubles"], ["3B", "triples"], ["HR", "hr"], ["RBI", "rbi"], ["R", "runs"], ["BB", "bb"], ["HBP", "hbp"], ["SO", "so"], ["SB", "sb"]] as const) {
          expect(query.point(target, code, "2026").value, `${id} ${code}`).toBe(legacy.bat[field]);
        }
      }
      if (legacy.pitch) {
        expect(query.point(target, "ERA", "2026").display).toBe(legacy.era);
        expect(query.point(target, "WHIP", "2026").display).toBe(legacy.whip);
        expect(query.point(target, "IP", "2026").display).toBe(legacy.ip);
        for (const [code, field] of [["W", "w"], ["L", "l"], ["SV", "sv"], ["HA", "ha"], ["RA", "runs_allowed"], ["ER", "er"], ["BBA", "bb"], ["K", "so"], ["HRA", "hr_allowed"]] as const) {
          expect(query.point(target, code, "2026").value, `${id} ${code}`).toBe(legacy.pitch[field]);
        }
      }
    }
  });

  it("/players/[id] 통산 표의 시즌 줄 = history(by season, 범위 all) — 경기별 기록이 있는 시즌", () => {
    const legacy = legacyPlayerPage(metricsFixture, 1, "Career").careerRows.find((row) => row.season === "2026")!;
    const at = (code: string) => query.history(GA, code, { by: "season", scope: "all" }).find((item) => item.key === "2026")!;
    expect(at("PA").value).toBe(legacy.pa);
    expect(at("H").value).toBe(legacy.hits);
    expect(at("AVG").value).toBeCloseTo(legacy.avg, 12);
    expect(at("OBP").value).toBeCloseTo(legacy.obp, 12);
    expect(at("SLG").value).toBeCloseTo(legacy.slg, 12);
    expect(at("ERA").value).toBeCloseTo(legacy.era, 12);
    expect(at("WHIP").value).toBeCloseTo(legacy.whip, 12);
    expect(at("IP").value).toBeCloseTo(legacy.ip, 12);
  });

  it("알려진 차이: 선수 페이지는 요약 행만 있는 시즌(2022~2025)을 보여 주지 않는다 — 조회 함수는 /records와 같은 값을 준다", () => {
    const legacy = legacyPlayerPage(metricsFixture, 1, "2023");
    expect(legacy.bat).toBeNull(); // 기존 선수 페이지: 기록 없음으로 표시
    expect(legacy.careerRows.map((row) => row.season)).toEqual(["2026"]);
    expect(query.point(GA, "AVG", "2023").display).toBe(legacyRecords(metricsFixture, "2023").batting.find((b) => b.name === "가선수")!.avg);
  });

  it("표기 함수는 합계에서 바로 계산한 값과 같다", () => {
    const totals = query.totals(NA, "pitching", "2026") as PitchingTotals;
    expect(displayMetric("ERA", totals)).toBe(query.point(NA, "ERA", "2026").display);
  });
});

describe("GET /api/metrics 쿼리 해석", () => {
  const parse = (qs: string) => parseMetricRequest(new URLSearchParams(qs));

  it("target", () => {
    expect(parseMetricTarget(null)).toEqual({ team: true });
    expect(parseMetricTarget("team")).toEqual({ team: true });
    expect(parseMetricTarget("player:12")).toEqual({ player: 12 });
    expect(parseMetricTarget("12")).toEqual({ player: 12 });
    expect(parseMetricTarget("player:abc")).toBeNull();
  });

  it("정상 요청", () => {
    const parsed = parse("mode=rank&code=ops&season=2026&minPa=10");
    expect(parsed).toMatchObject({ ok: true, request: { mode: "rank", code: "OPS", season: "2026", minPa: 10, minIp: undefined, qualify: false, scope: "roster", target: { team: true } } });
    expect(parse("mode=history&target=player:1&code=OBP&by=game&from=2026&to=2026-06-30")).toMatchObject({ ok: true, request: { by: "game", from: "2026", to: "2026-06-30" } });
    expect(parse("code=ERA&season=Career")).toMatchObject({ ok: true, request: { mode: "point" } });
    expect(parse("mode=rank&code=ERA&season=2026&qualify=1&target=player:2")).toMatchObject({ ok: true, request: { qualify: true, target: { player: 2 } } });
  });

  it("잘못된 요청은 이유와 함께 거절한다", () => {
    for (const qs of [
      "mode=drop&code=OPS&season=2026",
      "mode=point&code=NOPE&season=2026",
      "mode=point&code=OPS&season=Spring",
      "mode=point&code=OPS",
      "mode=point&code=OPS&season=2026&target=player:x",
      "mode=history&code=OPS&by=week",
      "mode=history&code=OPS&from=yesterday",
      "mode=rank&code=OPS&season=2026&minPa=-1",
      "mode=rank&code=OPS&season=2026&scope=everything",
    ]) {
      const parsed = parse(qs);
      expect(parsed.ok, qs).toBe(false);
      if (!parsed.ok) expect(parsed.error).toBeTruthy();
    }
  });
});

describe("AI 분석 근거 목록", () => {
  it("프롬프트에 넣은 값과 지표 코드를 함께 남긴다", async () => {
    const { createEvidenceCollector } = await import("@/lib/metrics/evidence");
    const evidence = createEvidenceCollector(query, "ko");
    expect(evidence.cite(GA, "OBP", "2026")).toBe("0.444");
    expect(evidence.cite(TEAM, "ERA", "2025", { fallback: "0.00" })).toBe("0.00");
    expect(evidence.cite(GA, "PA", "2026", { scope: "all" })).toBe("13");
    expect(evidence.list).toEqual([
      { code: "OBP", name: "출루율", season: "2026", target: "player:1", value: 4 / 9, display: "0.444" },
      { code: "ERA", name: "평균자책점", season: "2025", target: "team", value: null, display: "0.00" },
      { code: "PA", name: "타석", season: "2026", target: "player:1", value: 13, display: "13" },
    ]);
  });
});
