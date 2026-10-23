import { describe, expect, it } from "vitest";
import {
  DECISION_LABEL,
  DECISION_TYPES,
  DEFENSE_DECISION_TYPES,
  OFFENSE_DECISION_TYPES,
  normalizeDecisionType,
} from "@/lib/decisionTypes";
import { isMissingSeasonColumn } from "@/lib/teamReports";

describe("판단 유형", () => {
  it("예전 화면 값을 DB enum 값으로 바꾼다", () => {
    expect(normalizeDecisionType("pinch_hit")).toBe("pinch_hitter");
    expect(normalizeDecisionType("pinch_run")).toBe("pinch_runner");
    expect(normalizeDecisionType("defensive_shift")).toBe("defensive_alignment");
    expect(normalizeDecisionType("bunt")).toBe("bunt");
    expect(normalizeDecisionType("??")).toBe("other");
  });

  it("예전 값으로 저장된 기록도 라벨이 나온다", () => {
    expect(DECISION_LABEL.pinch_hit).toBe("대타");
    expect(DECISION_LABEL.pinch_hitter).toBe("대타");
    expect(DECISION_LABEL.infield_in).toBe("내야 전진");
  });

  it("공격·수비 분류가 전체 목록을 빠짐없이 나눈다", () => {
    expect(DEFENSE_DECISION_TYPES.size + OFFENSE_DECISION_TYPES.size).toBe(DECISION_TYPES.length);
  });
});

describe("팀 리포트 마이그레이션 감지", () => {
  it("season 컬럼이 없을 때의 오류를 알아본다", () => {
    expect(isMissingSeasonColumn({ code: "42703", message: 'column ai_reports.season does not exist' })).toBe(true);
    expect(isMissingSeasonColumn({ code: "PGRST204", message: "Could not find the 'season' column" })).toBe(true);
    expect(isMissingSeasonColumn({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingSeasonColumn(null)).toBe(false);
  });
});
