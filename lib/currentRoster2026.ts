export type CurrentRosterPlayer = {
  number: number;
  name: string;
};

// 2026 Spring Uniform Number.xlsx에서 "선수" 색상(EA9999)으로 표시된 현재 선수단
export const CURRENT_2026_PLAYER_ROSTER: CurrentRosterPlayer[] = [
  { number: 1, name: "소이어" },
  { number: 13, name: "임희찬" },
  { number: 14, name: "조경민" },
  { number: 25, name: "강배현" },
  { number: 35, name: "이호원" },
  { number: 56, name: "박지민" },
  { number: 82, name: "황서현" },
];
