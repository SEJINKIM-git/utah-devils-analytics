import { describe, expect, it } from "vitest";
import { type PlayerCandidate, describeAmbiguousPlayers, resolvePlayerMatch } from "@/lib/playerMatching";

const players: PlayerCandidate[] = [
  { id: 10, number: 52, name: "선수A", is_pitcher: true },
  { id: 20, number: 27, name: "선수F", is_pitcher: false },
  { id: 30, number: 7, name: "선수G", is_pitcher: false },
  { id: 31, number: 7, name: "선수 G", is_pitcher: false }, // 공백만 다른 중복 레코드
  { id: 40, number: 72, name: "홍길동", is_pitcher: false }, // 동명이인 (배번 다름)
  { id: 41, number: 74, name: "홍길동", is_pitcher: false },
];

describe("resolvePlayerMatch", () => {
  it("배번만 같고 이름이 다르면 기존 선수를 쓰지 않고 새로 만든다 (이전: 이름을 덮어씀)", () => {
    // 2026 명단 업로드: #52 선수B → 2022 #52 선수A 레코드를 건드리면 안 된다
    expect(resolvePlayerMatch(players, 52, "선수B", false)).toEqual({ action: "create" });
  });

  it("배번과 이름이 모두 같으면 기존 선수를 쓴다", () => {
    const match = resolvePlayerMatch(players, 27, "선수F", false);
    expect(match).toMatchObject({ action: "use", player: { id: 20 }, updates: {} });
  });

  it("이름 공백 차이는 같은 선수로 보고, 가장 최근 레코드를 고른다", () => {
    expect(resolvePlayerMatch(players, 7, "선수G", false)).toMatchObject({ action: "use", player: { id: 31 } });
  });

  it("배번이 없는 현장 기록지는 이름으로 찾는다", () => {
    expect(resolvePlayerMatch(players, null, "선수A", false)).toMatchObject({ action: "use", player: { id: 10 } });
    expect(resolvePlayerMatch(players, null, "새선수", false)).toEqual({ action: "create" });
  });

  it("배번이 없는데 같은 이름이 다른 배번으로 여럿이면 저장하지 않는다 (ambiguous)", () => {
    const match = resolvePlayerMatch(players, null, "홍길동", false);
    expect(match.action).toBe("ambiguous");
    if (match.action === "ambiguous") {
      expect(match.candidates.map((p) => p.id)).toEqual([41, 40]);
      expect(describeAmbiguousPlayers("홍길동", match.candidates)).toContain("#72 홍길동");
      expect(describeAmbiguousPlayers("홍길동", match.candidates)).toContain("#74 홍길동");
    }
  });

  it("같은 배번의 중복 레코드(공백 차이)는 동명이인이 아니다", () => {
    expect(resolvePlayerMatch(players, null, "선수G", false)).toMatchObject({ action: "use", player: { id: 31 } });
  });

  it("배번이 있으면 동명이인이어도 그 배번의 선수를 쓴다", () => {
    expect(resolvePlayerMatch(players, 72, "홍길동", false)).toMatchObject({ action: "use", player: { id: 40 } });
  });

  it("배번이 바뀐 선수는 새 레코드로 만든다 (기존 레코드의 배번을 바꾸지 않음)", () => {
    expect(resolvePlayerMatch(players, 99, "선수F", false)).toEqual({ action: "create" });
  });

  it("투수로 처음 기록되면 투수 여부만 보강한다", () => {
    expect(resolvePlayerMatch(players, 27, "선수F", true)).toMatchObject({
      action: "use",
      updates: { is_pitcher: true },
    });
  });
});
