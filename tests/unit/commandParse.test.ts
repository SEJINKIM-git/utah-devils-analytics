/**
 * 검색 팔레트 해석기 — "대상 + 기능" 문법.
 */
import { describe, expect, it } from "vitest";
import { buildCommandGroups, parseCommand, type CommandPlayer } from "@/lib/command/parse";

const players: CommandPlayer[] = [
  { id: 1, number: 7, name: "가선수", terms: ["가선수", "Ga Player"] },
  { id: 2, number: 18, name: "나선수", terms: ["나선수", "Na Player"], isPitcher: true },
  { id: 3, number: 21, name: "가나다", terms: ["가나다"] },
];
const parse = (input: string) => parseCommand(input, { players });
const groups = (input: string, season: string | null = "2026", lang: "ko" | "en" = "ko") =>
  buildCommandGroups(parse(input), { lang, season });
const first = (input: string, season: string | null = "2026") => groups(input, season)[0]?.items[0];

describe("parseCommand", () => {
  it("빈 입력", () => {
    expect(parse("").intent).toEqual({ type: "empty" });
    expect(parse("   ").intent).toEqual({ type: "empty" });
    expect(groups("")).toEqual([]);
  });

  it("선수 + 지표 + 시즌: 가선수 OBP 2026", () => {
    const parsed = parse("가선수 OBP 2026");
    expect(parsed.intent).toMatchObject({ type: "player-metric", player: { id: 1 }, metric: { code: "OBP" } });
    expect(parsed.season).toBe("2026");
    expect(parsed.rest).toBe("가선수");
  });

  it("순서가 바뀌어도, 한글 이름으로 적어도 같다", () => {
    for (const input of ["OBP 가선수", "가선수 출루율", "출루율 가선수 2026", "2026 가선수 obp", "  가선수   출루  "]) {
      expect(parse(input).intent, input).toMatchObject({ type: "player-metric", player: { id: 1 }, metric: { code: "OBP" } });
    }
  });

  it("팀 + 지표: 팀 ERA", () => {
    expect(parse("팀 ERA").intent).toMatchObject({ type: "team-metric", metric: { code: "ERA" } });
    expect(parse("team era").intent).toMatchObject({ type: "team-metric", metric: { code: "ERA" } });
    expect(parse("팀 방어율 2025").season).toBe("2025");
  });

  it("지표만: OBP → 순위표(지표 시트)", () => {
    expect(parse("OBP").intent).toMatchObject({ type: "metric", metric: { code: "OBP" } });
    expect(parse("출루").intent).toMatchObject({ type: "metric", metric: { code: "OBP" } });
    expect(parse("on base").intent).toMatchObject({ type: "metric", metric: { code: "OBP" } });
    expect(parse("k/5").intent).toMatchObject({ type: "metric", metric: { code: "K5" } });
  });

  it("통산은 시즌 Career로 읽는다", () => {
    expect(parse("가선수 OPS 통산").season).toBe("Career");
    expect(parse("career ops").season).toBe("Career");
  });

  it("선수만: 이름 일부, 영문 표기, 배번", () => {
    expect(parse("가선").intent).toMatchObject({ type: "player", player: { id: 1 } });
    expect(parse("na player").intent).toMatchObject({ type: "player", player: { id: 2 } });
    expect(parse("18").intent).toMatchObject({ type: "player", player: { id: 2 } });
    expect(parse("#7").intent).toMatchObject({ type: "player", player: { id: 1 } });
    expect(parse("가").players.map((p) => p.id)).toEqual([1, 3]);
  });

  it("화면: 순위, 일정, 득점권", () => {
    expect(parse("순위").intent).toMatchObject({ type: "screen", screen: { href: "/records" } });
    expect(parse("일정").intent).toMatchObject({ type: "screen", screen: { href: "/schedule" } });
    expect(parse("득점권").intent).toMatchObject({ type: "screen", screen: { href: "/situations/offense" } });
    expect(parse("schedule").intent).toMatchObject({ type: "screen", screen: { href: "/schedule" } });
  });

  it("문장형 질문은 AI에게 넘긴다", () => {
    for (const input of ["이번 시즌 누가 제일 잘 쳤어?", "다음 경기 선발 추천해줘", "who should lead off", "무슨말인지모를글자"]) {
      const parsed = parse(input);
      expect(parsed.intent, input).toEqual({ type: "ask", question: input });
    }
  });

  it("질문 안에 지표가 있어도 질문으로 본다", () => {
    expect(parse("출루율은 어떻게 올려?").intent.type).toBe("ask");
    // 그래도 지표 묶음에는 그 지표가 나온다
    expect(parse("출루율은 어떻게 올려?").metrics.map((m) => m.code)).toEqual([]);
    expect(parse("OBP 어떻게 올려?").metrics.map((m) => m.code)).toContain("OBP");
  });

  it("지표가 여럿 걸리면 정확히 일치하는 것이 먼저", () => {
    expect(parse("삼진").metrics.map((m) => m.code)[0]).toBe("SO");
    expect(parse("삼진").metrics.map((m) => m.code)).toEqual(expect.arrayContaining(["SO", "K"]));
  });
});

describe("buildCommandGroups", () => {
  it("지표 선택은 지표 설명 시트를 연다", () => {
    expect(first("출루")).toMatchObject({ group: "metric", title: "출루율", badge: "OBP", action: { type: "metric", code: "OBP", season: "2026" } });
    expect(first("팀 ERA")).toMatchObject({ group: "metric", title: "팀 평균자책점", action: { type: "metric", code: "ERA" } });
  });

  it("선수 + 지표는 그 선수의 지표로 바로 간다 (시즌 유지)", () => {
    expect(first("가선수 출루율")).toMatchObject({
      group: "player",
      title: "가선수 · 출루율",
      badge: "#7",
      action: { type: "navigate", href: "/players/1?season=2026&metric=OBP" },
    });
    // 검색어의 시즌이 지금 보는 시즌보다 먼저다
    expect(first("가선수 OBP 2024")?.action).toEqual({ type: "navigate", href: "/players/1?season=2024&metric=OBP" });
  });

  it("선수 선택은 선수 페이지로", () => {
    expect(first("나선수")).toMatchObject({ group: "player", title: "나선수", subtitle: "투수 · 선수 페이지", action: { type: "navigate", href: "/players/2?season=2026" } });
    expect(first("나선수", null)?.action).toEqual({ type: "navigate", href: "/players/2" });
  });

  it("화면 선택은 그 화면으로 (시즌 유지)", () => {
    expect(first("순위")).toMatchObject({ group: "screen", action: { type: "navigate", href: "/records?season=2026" } });
  });

  it("질문은 /team-analysis로 넘긴다", () => {
    const item = first("누가 제일 잘 쳤어?");
    expect(item).toMatchObject({ group: "ask" });
    expect(item?.action).toEqual({ type: "navigate", href: `/team-analysis?season=2026&q=${encodeURIComponent("누가 제일 잘 쳤어?").replace(/%20/g, "+")}` });
  });

  it("묶음 순서: 해석한 의도가 맨 위, 묶음은 네 가지뿐", () => {
    expect(groups("가선수 출루율").map((g) => g.group)).toEqual(["player", "metric"]);
    expect(groups("출루").map((g) => g.group)[0]).toBe("metric");
    for (const input of ["가", "순위", "출루", "아무말이나 길게 적어 본다"]) {
      for (const g of groups(input)) expect(["metric", "player", "screen", "ask"]).toContain(g.group);
    }
  });

  it("영어", () => {
    expect(groups("obp", "2026", "en")[0].items[0]).toMatchObject({ title: "On-base %", badge: "OBP" });
    expect(groups("schedule", null, "en")[0].items[0]).toMatchObject({ title: "Schedule", action: { type: "navigate", href: "/schedule" } });
  });

  it("항목 id는 겹치지 않는다 (aria-activedescendant용)", () => {
    for (const input of ["가", "삼진", "가선수 OPS", "순위"]) {
      const ids = groups(input).flatMap((g) => g.items.map((i) => i.id));
      expect(new Set(ids).size, input).toBe(ids.length);
    }
  });
});
