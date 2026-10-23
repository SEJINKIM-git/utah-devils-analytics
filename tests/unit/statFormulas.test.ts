import { describe, expect, it } from "vitest";
import {
  ERA_BASE_INNINGS,
  computeEra,
  computeWhip,
  eraFromInnings,
  formatRate,
  inningsDecimal,
  normalizeInningsForStorage,
  sumInnings,
} from "@/lib/statFormulas";

describe("이닝 표기", () => {
  it("야구식 표기를 실제 이닝으로 바꾼다", () => {
    expect(inningsDecimal(46.2)).toBeCloseTo(46.667, 3);
    expect(inningsDecimal("3.1")).toBeCloseTo(3.333, 3);
    expect(inningsDecimal(5)).toBe(5);
    expect(inningsDecimal(null)).toBe(0);
  });

  it("표기끼리 더하지 않고 실제 이닝으로 더한다 (30.2 + 55.2 = 86.1)", () => {
    expect(sumInnings([30.2, 55.2])).toBeCloseTo(86 + 1 / 3, 6);
    expect(sumInnings([1.1, 1.1, 1.1])).toBe(4);
  });

  it("저장 전 소수 표기(3.3, 1.7)를 야구식 표기로 통일한다", () => {
    expect(normalizeInningsForStorage(3.3)).toBe(3.1);
    expect(normalizeInningsForStorage(1.7)).toBe(1.2);
    expect(normalizeInningsForStorage("46.2")).toBe(46.2);
    expect(normalizeInningsForStorage(3)).toBe(3);
    expect(normalizeInningsForStorage("")).toBe(0);
  });
});

describe("ERA / WHIP", () => {
  it(`ERA는 ${ERA_BASE_INNINGS}이닝 기준이고 실제 이닝으로 나눈다`, () => {
    // 2023 시즌 기록지: ER 37, 46.2이닝 → 37×5 / 46.667 = 3.96 (이전 코드: 37×5/46.2 = 4.00)
    expect(ERA_BASE_INNINGS).toBe(5);
    expect(formatRate(computeEra(37, 46.2))).toBe("3.96");
  });

  it("이전 경기 리뷰·선수 비교의 9이닝 기준과 다르다", () => {
    const era9 = (2 * 9) / inningsDecimal(3.1);
    expect(computeEra(2, 3.1)).toBeCloseTo((2 * 5) / (10 / 3), 6);
    expect(computeEra(2, 3.1)).not.toBeCloseTo(era9, 2);
  });

  it("WHIP = (피안타 + 볼넷) / 실제 이닝", () => {
    expect(computeWhip(66, 42, 46.2)).toBeCloseTo(108 / (140 / 3), 6);
  });

  it("이닝이 0이면 null, 표시는 대체 문자", () => {
    expect(computeEra(3, 0)).toBeNull();
    expect(eraFromInnings(3, 0)).toBeNull();
    expect(formatRate(null)).toBe("---");
    expect(formatRate(null, 2, "-")).toBe("-");
  });
});
