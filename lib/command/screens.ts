/**
 * 검색 팔레트의 "화면" 묶음. 선수·경기·팀 세 출발점으로 나눈다.
 * 운영 화면(업로드 등)은 로그인이 필요해 여기 넣지 않는다.
 */
export type ScreenGroup = "player" | "game" | "team";

export type ScreenDef = {
  id: string;
  href: string;
  group: ScreenGroup;
  labelKo: string;
  labelEn: string;
  hintKo: string;
  hintEn: string;
  keywords: string[];
};

export const SCREENS: readonly ScreenDef[] = [
  { id: "records", href: "/records", group: "team", labelKo: "기록 · 순위", labelEn: "Records & rankings", hintKo: "타자·투수 시즌 기록표", hintEn: "Season batting and pitching tables", keywords: ["순위", "순위표", "기록", "기록표", "랭킹", "records", "ranking", "rankings", "leaderboard"] },
  { id: "dashboard", href: "/", group: "team", labelKo: "대시보드", labelEn: "Dashboard", hintKo: "팀 한눈에 보기", hintEn: "Team at a glance", keywords: ["홈", "대시보드", "메인", "home", "dashboard"] },
  { id: "team-analysis", href: "/team-analysis", group: "team", labelKo: "AI 분석", labelEn: "AI analysis", hintKo: "팀 시즌 리포트", hintEn: "Team season report", keywords: ["ai", "분석", "리포트", "보고서", "analysis", "report"] },
  { id: "lineup", href: "/lineup", group: "player", labelKo: "선수단", labelEn: "Roster", hintKo: "명단과 라인업", hintEn: "Roster and lineup", keywords: ["선수단", "명단", "라인업", "타순", "roster", "lineup"] },
  { id: "compare", href: "/compare", group: "player", labelKo: "선수 비교", labelEn: "Compare players", hintKo: "두 선수 기록 나란히 보기", hintEn: "Two players side by side", keywords: ["비교", "선수 비교", "compare", "versus", "vs"] },
  { id: "schedule", href: "/schedule", group: "game", labelKo: "일정", labelEn: "Schedule", hintKo: "경기·훈련 일정", hintEn: "Games and practices", keywords: ["일정", "경기 일정", "스케줄", "schedule"] },
  { id: "calendar", href: "/calendar", group: "game", labelKo: "달력", labelEn: "Calendar", hintKo: "달력으로 보는 일정", hintEn: "Schedule as a calendar", keywords: ["달력", "캘린더", "calendar"] },
  { id: "situations", href: "/situations/hub", group: "game", labelKo: "상황 센터", labelEn: "Situation center", hintKo: "경기 상황별 판단", hintEn: "Decisions by game situation", keywords: ["상황", "상황 센터", "situation", "situations"] },
  { id: "offense", href: "/situations/offense", group: "game", labelKo: "공격 상황", labelEn: "Offense situations", hintKo: "득점권·주자 상황", hintEn: "Scoring position and baserunners", keywords: ["공격", "득점권", "주자", "작전", "offense", "risp"] },
  { id: "defense", href: "/situations/defense", group: "game", labelKo: "수비 상황", labelEn: "Defense situations", hintKo: "수비 위치와 대응", hintEn: "Defensive alignment", keywords: ["수비", "시프트", "defense"] },
  { id: "game-notes", href: "/situations/game-notes", group: "game", labelKo: "경기 노트", labelEn: "Game notes", hintKo: "경기 중 메모", hintEn: "In-game notes", keywords: ["경기 노트", "노트", "메모", "notes"] },
  { id: "post-game", href: "/situations/post-game", group: "game", labelKo: "경기 후 복기", labelEn: "Post-game", hintKo: "끝난 경기 돌아보기", hintEn: "Look back at a finished game", keywords: ["경기 후", "복기", "post game", "postgame"] },
  { id: "game-review", href: "/game-review", group: "game", labelKo: "경기 리뷰", labelEn: "Game review", hintKo: "경기 기록 다시 보기", hintEn: "Review a game's record", keywords: ["경기 리뷰", "리뷰", "review", "box score"] },
];

export function screenLabel(screen: ScreenDef, lang: "ko" | "en") {
  return lang === "ko" ? screen.labelKo : screen.labelEn;
}

export function screenHint(screen: ScreenDef, lang: "ko" | "en") {
  return lang === "ko" ? screen.hintKo : screen.hintEn;
}
