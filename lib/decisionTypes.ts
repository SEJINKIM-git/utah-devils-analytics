/**
 * 경기 판단 유형 — DB enum `decision_type`과 1:1로 맞춘 단일 목록.
 *
 * 이전에는 화면마다 목록을 따로 들고 있었고 그중 pinch_hit, pinch_run, defensive_shift,
 * infield_in, no_doubles는 DB enum에 없어 이 유형으로 기록하면 저장이 실패했다.
 * (infield_in, no_doubles는 sql/002_decision_types.sql로 enum에 추가)
 */
export const DECISION_TYPES = [
  { value: "pitching_change", label: "투수 교체", side: "defense" },
  { value: "intentional_walk", label: "고의사구", side: "defense" },
  { value: "defensive_alignment", label: "수비 시프트", side: "defense" },
  { value: "infield_in", label: "내야 전진", side: "defense" },
  { value: "no_doubles", label: "노더블 얼라인", side: "defense" },
  { value: "steal_attempt", label: "도루 시도", side: "offense" },
  { value: "bunt", label: "번트", side: "offense" },
  { value: "hit_and_run", label: "히트앤런", side: "offense" },
  { value: "pinch_hitter", label: "대타", side: "offense" },
  { value: "pinch_runner", label: "대주자", side: "offense" },
  { value: "other", label: "기타", side: "offense" },
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number]["value"];

/** 예전 화면·AI 응답에서 쓰던 이름 → DB 값 */
const LEGACY_ALIASES: Record<string, DecisionType> = {
  defensive_shift: "defensive_alignment",
  pinch_hit: "pinch_hitter",
  pinch_run: "pinch_runner",
};

export function normalizeDecisionType(value: unknown): DecisionType {
  const raw = String(value ?? "").trim();
  if (raw in LEGACY_ALIASES) return LEGACY_ALIASES[raw];
  return (DECISION_TYPES.find((t) => t.value === raw)?.value ?? "other") as DecisionType;
}

export const DECISION_LABEL: Record<string, string> = Object.fromEntries([
  ...DECISION_TYPES.map((t) => [t.value, t.label]),
  ...Object.entries(LEGACY_ALIASES).map(([legacy, v]) => [legacy, DECISION_TYPES.find((t) => t.value === v)!.label]),
]);

export const DEFENSE_DECISION_TYPES = new Set<string>(
  DECISION_TYPES.filter((t) => t.side === "defense").map((t) => t.value)
);
export const OFFENSE_DECISION_TYPES = new Set<string>(
  DECISION_TYPES.filter((t) => t.side === "offense").map((t) => t.value)
);

/** AI 프롬프트용 "a|b|c" */
export const DECISION_TYPE_CHOICES = DECISION_TYPES.map((t) => t.value).join("|");
