type GuidanceScope = "player" | "team" | "gameReview";
type GuidanceLang = "ko" | "en";

const KO_BASE_GUIDANCE = `
[2026 Spring 훈련 계획서 기준]
- 출석관리: 활동 시작 전 인원 점검, 행사 전날까지 참석 여부 확인, 종료 후 기록 정리.
- 핵심 목표: 타격 개선, 수비 기본기 강화, 신규 선수 육성.
- 월요일 훈련: 팀 전체 훈련 중심. 주루플레이, 콜플레이, 상황별 연습, 작전, 중계플레이, 포지션별 필딩, 피칭 점검.
- 금요일 훈련: 실제 가능한 날짜가 적어서 타격 훈련 위주. 티배팅, 토스배팅 등 기본기 반복.
- 수비 훈련: 내야/외야, 투수/포수 등 포지션을 나눠 기본기와 디테일을 강화.
- 타격 훈련: 박지민 중심 기본기 점검, 필요 시 폼 교정 총괄. 황서현은 머리 고정, 손목, 시선 고정 등 기본 체크. 인당 짧은 반복 훈련 구조.
- 경기 전 준비: 경기 전 배팅장 방문은 강제가 아니라 자발 참여를 강력 권고.
- 시즌 후반 방향: 기록 분석을 바탕으로 선수별 기량 발전 계획을 구상.

[피드백 작성 원칙]
- 개선 방안은 반드시 위 훈련 구조 안에서 실현 가능해야 한다.
- 추상적인 정신론 대신 다음 훈련에서 바로 실행할 수 있는 행동으로 제안한다.
- 월요일 팀훈련, 금요일 타격훈련, 포지션별 수비훈련, 경기 전 배팅장 권고 중 어디에 연결되는지 드러나게 작성한다.
- 비용이 많이 드는 외부 프로그램, 개인 레슨, 장기 캠프처럼 계획서에 없는 제안은 피한다.
- 선수별 피드백은 기본기, 반복 훈련, 포지션별 역할, 경기 전 준비 루틴과 연결한다.
`.trim();

const EN_BASE_GUIDANCE = `
[Reference: 2026 Spring Training Plan]
- Attendance management is strict before each activity and finalized after events.
- Core goals: improve hitting, strengthen defensive fundamentals, and develop newer players.
- Monday sessions are full-team practices focused on baserunning, communication, situational play, tactics, relay play, position-based fielding, and pitching check-ins.
- Friday sessions are limited and therefore mainly used for hitting work such as tee and toss batting.
- Defensive work is split by role or position group such as infield/outfield and battery.
- Hitting work is fundamentals-first, with Park Jimin overseeing core mechanics and larger corrections, and Hwang Seohyeon reinforcing head stability, wrist position, and visual focus.
- Pre-game batting cage visits are strongly recommended but remain voluntary.
- Late-season development should be based on record analysis and player-specific growth plans.

[Feedback rules]
- Improvement ideas must be realistic within this actual training structure.
- Avoid vague motivation-only advice; suggest actions that can be done in the next team session.
- Make it clear whether a recommendation belongs in Monday team practice, Friday hitting work, position-specific defense work, or pre-game preparation.
- Avoid suggestions that require expensive outside programs or resources not present in the plan.
- Tie player feedback to fundamentals, repetition, positional responsibility, and practical pre-game routines.
`.trim();

function getScopeAddendum(lang: GuidanceLang, scope: GuidanceScope) {
  if (lang === "en") {
    if (scope === "player") {
      return `
[Player-specific output rule]
- The "training_plan" field should read like a realistic short-term development plan for this player inside the current Utah Devils spring structure.
- Prefer 2-3 concrete drills, one positional focus, and one pre-game preparation habit when relevant.
`.trim();
    }
    if (scope === "team") {
      return `
[Team-specific output rule]
- Strategic recommendations should map to actual team sessions and coaching structure.
- Prefer recommendations such as situational defense reps, communication reps, tee/toss batting blocks, position-group work, and record-based follow-up plans.
`.trim();
    }
    return `
[Game review output rule]
- "improvement_plan" and "next_game_strategy" should connect directly to the next available Monday or Friday training blocks.
- Prefer actionable follow-ups such as relay/backup reps, call-play reps, toss batting, tee batting, positional fielding reps, pitching check-ins, or voluntary pre-game batting cage prep.
`.trim();
  }

  if (scope === "player") {
    return `
[선수 피드백 추가 원칙]
- "training_plan"은 이 선수가 현재 Utah Devils 봄학기 훈련 구조 안에서 바로 실행할 수 있는 단기 발전 계획처럼 작성한다.
- 가능하면 2~3개의 구체적 드릴, 1개의 포지션 수비 포인트, 필요 시 1개의 경기 전 준비 습관을 포함한다.
`.trim();
  }
  if (scope === "team") {
    return `
[팀 피드백 추가 원칙]
- 전략 제안은 실제 팀 훈련 구조와 코칭 분담에 맞아야 한다.
- 상황별 수비 반복, 콜플레이, 티/토스 배팅, 포지션 그룹 훈련, 기록 분석 후 후속 계획 같은 형태를 우선 제안한다.
`.trim();
  }
  return `
[경기 리뷰 추가 원칙]
- "improvement_plan"과 "next_game_strategy"는 다음 월요일 또는 금요일 훈련에서 바로 실행할 수 있게 작성한다.
- 중계플레이/백업플레이/콜플레이 반복, 토스배팅, 티배팅, 포지션별 필딩, 피칭 점검, 경기 전 배팅장 준비 같은 후속조치를 우선 제안한다.
`.trim();
}

export function getTrainingPlanGuidance(lang: GuidanceLang, scope: GuidanceScope) {
  const base = lang === "en" ? EN_BASE_GUIDANCE : KO_BASE_GUIDANCE;
  return `${base}\n\n${getScopeAddendum(lang, scope)}`;
}
