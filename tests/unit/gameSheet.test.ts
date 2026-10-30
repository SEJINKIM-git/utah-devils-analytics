/**
 * 경기 기록지 v3.0 파서. 기대값(expected.json)은 공식 템플릿 수식이 계산한 값이라 파서와 독립된 기준이다.
 * 같은 기대값으로 Streamlit 콘솔 파서(console/tests/test_game_sheet.py)도 검사한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { extractGameMetaFromFilename } from "@/lib/gameFileMeta";
import { parseGameWorkbook } from "@/lib/gameSheet";
import { parseOfficialGamePitchingSheet } from "@/lib/officialGameWorkbook";
import { computeEra, computeObp, obpDenominator } from "@/lib/statFormulas";

const DIR = path.resolve(__dirname, "../fixtures/game-v3");
const expected = JSON.parse(readFileSync(path.join(DIR, "expected.json"), "utf8"));
const FILE_NAME = "10_17 VS 테스트팀 경기 기록.xlsx";
const read = (file: string) => XLSX.read(readFileSync(path.join(DIR, file)), { type: "buffer" });
const parse = (file: string, name = FILE_NAME) => parseGameWorkbook(read(file), name, "2026");

const BAT_KEYS = ["pa", "ab", "hits", "doubles", "triples", "hr", "bb", "hbp", "so", "sf", "sh", "ci", "runs", "rbi", "sb"] as const;
const PIT_KEYS = ["outs", "pitches", "ha", "runs_allowed", "er", "bb", "hbp", "so", "hr_allowed", "w", "l", "sv", "hld"] as const;

describe.each(["recalculated.xlsx", "uncached.xlsx", "reviewed.xlsx"])("%s", (file) => {
  const parsed = parse(file);

  it("v3.0 형식으로 인식하고 경기 정보를 읽는다", () => {
    expect(parsed.format).toBe("v3");
    expect(parsed.info).toMatchObject({
      date: expected.info.date, opponent: expected.info.opponent, season: expected.info.season,
      isHome: expected.info.is_home, location: expected.info.location,
      scoreUs: expected.info.score_us, scoreThem: expected.info.score_them, defenseOuts: expected.info.defense_outs,
    });
  });

  it("타자 기록이 템플릿 수식 결과와 같다 (희생플라이·희생번트·포수방해·확장 타석·교체 선수 포함)", () => {
    expect(parsed.batting.map((b) => b.name)).toEqual(expected.batting.map((b: { name: string }) => b.name));
    for (const exp of expected.batting) {
      const got = parsed.batting.find((b) => b.name === exp.name)!;
      for (const k of BAT_KEYS) expect(got[k], `${exp.name} ${k}`).toBe(exp[k]);
      expect(computeObp(got)!, `${exp.name} OBP`).toBeCloseTo(exp.obp ?? 0, 5);
    }
  });

  it("팀 출루율이 템플릿과 같다 (분모 = 타수+볼넷+사구+희생플라이)", () => {
    const sum = (k: "hits" | "bb" | "hbp") => parsed.batting.reduce((s, b) => s + b[k], 0);
    const den = parsed.batting.reduce((s, b) => s + obpDenominator(b), 0);
    expect(computeObp({ hits: sum("hits"), bb: sum("bb"), hbp: sum("hbp"), obp_den: den })!).toBeCloseTo(expected.team.obp, 5);
    expect(parsed.batting.reduce((s, b) => s + b.pa, 0)).toBe(expected.team.pa);
  });

  it("투수 기록이 템플릿과 같다 (아웃 수·투구수·홀드)", () => {
    for (const exp of expected.pitching) {
      const got = parsed.pitching.find((p) => p.name === exp.name)!;
      for (const k of PIT_KEYS) expect(got[k], `${exp.name} ${k}`).toBe(exp[k]);
      expect(String(got.ip.toFixed(1))).toBe(exp.ip_notation);
      expect(computeEra(got.er, got.ip) ?? 0, `${exp.name} ERA`).toBeCloseTo(exp.era, 5);
    }
  });
});

describe("경고", () => {
  it("검수 미완료면 미완료 항목을 알려 준다", () => {
    const w = parse("recalculated.xlsx").warnings.join("\n");
    expect(w).toContain("검수 시트 상태: 확인 필요");
    expect(w).toContain("플레이 판정 확인");
  });

  it("검수 완료·점수·아웃이 모두 맞으면 경고가 없다", () => {
    const p = parse("reviewed.xlsx");
    expect(p.review.status).toBe("검수 완료");
    expect(p.warnings).toEqual([]);
  });

  it("Excel로 다시 저장하지 않은 파일은 검수 결과가 없다고 알려 준다 (기록은 정상 계산)", () => {
    expect(parse("uncached.xlsx").warnings).toContain("검수 시트를 찾지 못했거나 검수 요약이 비어 있습니다.");
  });

  it("날짜를 입력하지 않아 =TODAY()가 남아 있으면 경고한다", () => {
    expect(parse("today-formula.xlsx").warnings.join("\n")).toContain("=TODAY()");
  });

  it("파일명 날짜가 경기 정보와 다르면 경기 정보 날짜로 저장하고 경고한다", () => {
    const p = parse("reviewed.xlsx", "9_17 VS 테스트팀 경기 기록.xlsx");
    expect(p.info.date).toBe("2026-10-17");
    expect(p.warnings.join("\n")).toContain("파일명 날짜(2026-09-17)");
  });

  it("수식 결과와 타석 결과가 다르면 알려 주고 타석 결과로 저장한다", () => {
    const wb = read("reviewed.xlsx");
    const sheet = wb.Sheets["타자 기록"];
    sheet["M2"] = { t: "n", v: 9 }; // 가선수 타수 캐시를 엉뚱한 값으로
    const p = parseGameWorkbook(wb, FILE_NAME, "2026");
    expect(p.batting[0].ab).toBe(3);
    expect(p.warnings.join("\n")).toContain("가선수: 기록지 수식 값과 타석 결과 계산이 다름 (타수 9→3)");
  });

  it("목록에 없는 타석 결과는 타석으로만 세고 경고한다", () => {
    const wb = read("uncached.xlsx");
    wb.Sheets["타자 기록"]["H2"] = { t: "s", v: "중전안타" };
    const p = parseGameWorkbook(wb, FILE_NAME, "2026");
    expect(p.batting[0].pa).toBe(6);
    expect(p.batting[0].hits).toBe(3);
    expect(p.warnings.join("\n")).toContain("목록에 없는 타석 결과 '중전안타'");
  });

  it("투수 실점 합이 상대 점수와 다르면 알려 준다", () => {
    const wb = read("reviewed.xlsx");
    wb.Sheets["경기 정보"]["C9"] = { t: "n", v: 5 };
    expect(parseGameWorkbook(wb, FILE_NAME, "2026").warnings).toContain("상대 점수 5 ≠ 투수 실점 합 2");
  });
});

describe(".xlsm (매크로 포함 템플릿 그대로 저장한 파일)", () => {
  it("파일명이 .xlsm이어도 같은 내용으로 읽히고 파일명 날짜·상대팀을 인식한다", () => {
    // 내용은 같은 zip 구조라 확장자와 무관하게 읽힌다. 업로드 화면(accept)과 파일명 해석이 .xlsm을 받는지가 핵심.
    const p = parse("reviewed.xlsx", "10_17 VS 테스트팀 경기 기록.xlsm");
    expect(p.format).toBe("v3");
    expect(p.info).toMatchObject({ date: "2026-10-17", opponent: "테스트팀" });
    expect(p.warnings).toEqual([]);                                   // 파일명 대조도 일치
    expect(extractGameMetaFromFilename("10_17 VS 테스트팀 경기 기록.xlsm", "2026")).toMatchObject({ date: "2026-10-17", opponent: "테스트팀" });
    const accept = readFileSync(path.resolve(__dirname, "../../app/upload/page.tsx"), "utf8").match(/accept="([^"]+)"/)?.[1] ?? "";
    expect(accept.split(",")).toContain(".xlsm");
  });
});

describe("이전 형식 경기 파일", () => {
  it("결과 칸의 '홀'을 홀드로 저장한다 (이전: 항상 0)", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["이름", "결과", "이닝", "피안타", "실점", "자책", "볼넷", "삼진"],
      ["가선수", "홀", 1, 0, 0, 0, 0, 2],
      ["나선수", "세", 1, 0, 0, 0, 0, 1],
    ]);
    const rows = parseOfficialGamePitchingSheet(sheet);
    expect(rows.map((r) => [r.name, r.hld, r.sv])).toEqual([["가선수", 1, 0], ["나선수", 0, 1]]);
  });
});
