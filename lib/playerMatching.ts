import { normalizePlayerName } from "@/lib/playerIdentity";

export type PlayerCandidate = {
  id: number;
  name: string;
  number: number | null;
  is_pitcher: boolean | null;
};

export type PlayerMatch =
  | { action: "use"; player: PlayerCandidate; updates: Partial<Pick<PlayerCandidate, "is_pitcher">> }
  | { action: "create" };

/**
 * 업로드 행 → 기존 선수 레코드 결정.
 *
 * 이전 동작: 배번이 같으면 무조건 같은 선수로 보고 이름을 새 이름으로 덮어썼다.
 * 그래서 2026 명단을 올리자 2022년 #52(선수A)의 레코드가 #52 선수B으로 이름이 바뀌어
 * 과거 기록이 현재 선수에게 붙었다. 배번은 해마다 주인이 바뀌므로 (배번, 이름)으로 판단하고,
 * 기존 선수의 이름·배번은 절대 바꾸지 않는다.
 *
 *  - 배번 + 이름 일치            → 그 선수 사용
 *  - 배번 없음(현장 기록지) + 이름 일치 → 가장 최근 등록된 동명 선수 사용
 *  - 그 외                        → 새 선수 생성
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

  const match =
    number && number > 0
      ? sameName.find((p) => (p.number ?? 0) === number)
      : sameName[0];

  if (!match) return { action: "create" };
  return {
    action: "use",
    player: match,
    updates: isPitcher && !match.is_pitcher ? { is_pitcher: true } : {},
  };
}
