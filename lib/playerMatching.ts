import { normalizePlayerName } from "@/lib/playerIdentity";

export type PlayerCandidate = {
  id: number;
  name: string;
  number: number | null;
  is_pitcher: boolean | null;
};

export type PlayerMatch =
  | { action: "use"; player: PlayerCandidate; updates: Partial<Pick<PlayerCandidate, "is_pitcher">> }
  | { action: "create" }
  /** 배번 없이 이름만 있는데 같은 이름이 서로 다른 배번으로 둘 이상 → 저장하지 않고 운영자가 골라야 한다 */
  | { action: "ambiguous"; candidates: PlayerCandidate[] };

/**
 * 업로드 행 → 기존 선수 레코드 결정.
 *
 * 이전 동작: 배번이 같으면 무조건 같은 선수로 보고 이름을 새 이름으로 덮어썼다.
 * 그래서 2026 명단을 올리자 2022년 #52(선수A)의 레코드가 #52 선수B으로 이름이 바뀌어
 * 과거 기록이 현재 선수에게 붙었다. 배번은 해마다 주인이 바뀌므로 (배번, 이름)으로 판단하고,
 * 기존 선수의 이름·배번은 절대 바꾸지 않는다.
 *
 *  - 배번 + 이름 일치                         → 그 선수 사용
 *  - 배번 없음(경기 기록지 v3.0) + 이름 일치 1명 → 그 선수 사용 (같은 배번의 중복 레코드는 최신 것)
 *  - 배번 없음 + 같은 이름이 다른 배번으로 여럿 → ambiguous (저장 중단, 경고)
 *  - 그 외                                     → 새 선수 생성
 */
export function resolvePlayerMatch(
  candidates: PlayerCandidate[],
  number: number | null,
  name: string,
  isPitcher: boolean
): PlayerMatch {
  const target = normalizePlayerName(name);
  const sameName = candidates
    .filter((p) => normalizePlayerName(p.name) === target)
    .sort((a, b) => b.id - a.id);

  let match: PlayerCandidate | undefined;
  if (number && number > 0) {
    match = sameName.find((p) => (p.number ?? 0) === number);
  } else {
    const distinctNumbers = new Set(sameName.map((p) => p.number ?? 0));
    if (distinctNumbers.size > 1) return { action: "ambiguous", candidates: sameName };
    match = sameName[0];
  }

  if (!match) return { action: "create" };
  return {
    action: "use",
    player: match,
    updates: isPitcher && !match.is_pitcher ? { is_pitcher: true } : {},
  };
}

/** 동명이인 안내 문구 (업로드 API·콘솔 공통 형식) */
export function describeAmbiguousPlayers(name: string, candidates: PlayerCandidate[]) {
  const list = candidates.map((p) => `#${p.number ?? "?"} ${p.name} (id ${p.id})`).join(", ");
  return `'${name}' 이름의 선수가 ${candidates.length}명 있어 어느 선수의 기록인지 정할 수 없습니다: ${list}. 기록지 이름에 구분자를 붙이거나 선수 명단을 정리한 뒤 다시 올려 주세요.`;
}
