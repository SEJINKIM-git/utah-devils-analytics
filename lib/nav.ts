/**
 * 메뉴 묶음: 선수 · 경기 · 팀 세 출발점 + 관리(로그인한 운영진만).
 * 주소는 그대로 두고 묶음만 정한다. Sidebar, MobileNav, 현재 위치 표시가 함께 쓴다.
 */
export type NavGroupId = "player" | "game" | "team" | "admin";
export type NavIcon = "users" | "compare" | "calendar" | "zap" | "review" | "dashboard" | "records" | "brain" | "upload";

export type NavItem = { href: string; labelKo: string; labelEn: string; icon: NavIcon; /** 이 주소로 시작하는 화면도 이 항목으로 본다 */ match?: string[] };
export type NavGroup = { id: NavGroupId; labelKo: string; labelEn: string; home: string; adminOnly?: boolean; items: NavItem[] };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "player", labelKo: "선수", labelEn: "Players", home: "/lineup",
    items: [
      { href: "/lineup", labelKo: "선수단", labelEn: "Roster", icon: "users" },
      { href: "/compare", labelKo: "선수 비교", labelEn: "Compare", icon: "compare" },
    ],
  },
  {
    id: "game", labelKo: "경기", labelEn: "Games", home: "/schedule",
    items: [
      { href: "/schedule", labelKo: "일정", labelEn: "Schedule", icon: "calendar", match: ["/calendar"] },
      { href: "/situations/hub", labelKo: "상황 센터", labelEn: "Situations", icon: "zap", match: ["/situations"] },
      { href: "/game-review", labelKo: "경기 리뷰", labelEn: "Game review", icon: "review" },
    ],
  },
  {
    id: "team", labelKo: "팀", labelEn: "Team", home: "/",
    items: [
      { href: "/", labelKo: "대시보드", labelEn: "Dashboard", icon: "dashboard" },
      { href: "/records", labelKo: "기록", labelEn: "Records", icon: "records" },
      { href: "/team-analysis", labelKo: "AI 분석", labelEn: "AI analysis", icon: "brain" },
    ],
  },
  {
    id: "admin", labelKo: "관리", labelEn: "Admin", home: "/upload", adminOnly: true,
    items: [{ href: "/upload", labelKo: "업로드", labelEn: "Upload", icon: "upload", match: ["/files", "/import"] }],
  },
];

const under = (pathname: string, prefix: string) => (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`));

/** 지금 주소가 어느 묶음·항목인지. 선수 페이지(/players/…)는 선수 묶음이고 항목은 없다(이름이 마지막 칸). */
export function locateNav(pathname: string): { group: NavGroup; item: NavItem | null } | null {
  if (under(pathname, "/players")) return { group: NAV_GROUPS[0], item: null };
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (under(pathname, item.href) || (item.match ?? []).some((prefix) => under(pathname, prefix))) return { group, item };
    }
  }
  return null;
}

export type Crumb = { label: string; href?: string };

/**
 * 현재 위치 (3단계 이하): "팀 › 선수 › 가선수", "팀 › 경기 › 일정", "팀 › 기록".
 * leaf는 화면이 직접 알려 주는 마지막 칸(선수 이름)이다.
 */
export function buildCrumbs(pathname: string, lang: "ko" | "en", leaf?: string | null): Crumb[] {
  const located = locateNav(pathname);
  if (!located) return [];
  const label = (entry: { labelKo: string; labelEn: string }) => (lang === "ko" ? entry.labelKo : entry.labelEn);
  const crumbs: Crumb[] = [{ label: lang === "ko" ? "팀" : "Team", href: "/" }];
  if (located.group.id !== "team") crumbs.push({ label: label(located.group), href: located.group.home });
  if (located.item) crumbs.push({ label: label(located.item), href: located.item.href });
  else if (leaf) crumbs.push({ label: leaf });
  // 마지막 칸은 지금 화면이라 링크를 달지 않는다
  if (crumbs.length > 1) delete crumbs[crumbs.length - 1].href;
  return crumbs.slice(0, 3);
}
