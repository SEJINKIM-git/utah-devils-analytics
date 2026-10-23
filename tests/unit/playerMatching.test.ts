import { describe, expect, it } from "vitest";
import { type PlayerCandidate, resolvePlayerMatch } from "@/lib/playerMatching";

const players: PlayerCandidate[] = [
  { id: 10, number: 52, name: "선수A", is_pitcher: true },
  { id: 20, number: 27, name: "선수F", is_pitcher: false },
  { id: 30, number: 7, name: "선수G", is_pitcher: false },
  { id: 31, number: 7, name: "선수 G", is_pitcher: false }, // 공백만 다른 중복 레코드
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
