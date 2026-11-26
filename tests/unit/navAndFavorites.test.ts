/**
 * 메뉴 묶음(선수 · 경기 · 팀)과 현재 위치, 즐겨찾기 저장.
 */
import { describe, expect, it } from "vitest";
import { FAVORITES_KEY, MAX_FAVORITES, parseFavorites, readFavorites, toggleFavorite, toggleFavoriteIn, type FavoritePlayer } from "@/lib/favorites";
import { NAV_GROUPS, buildCrumbs, locateNav } from "@/lib/nav";
import { SCREENS } from "@/lib/command/screens";

describe("메뉴 묶음", () => {
  it("출발점은 선수 · 경기 · 팀 셋이고 관리는 운영진 전용이다", () => {
    expect(NAV_GROUPS.map((g) => [g.id, g.labelKo, Boolean(g.adminOnly)])).toEqual([
      ["player", "선수", false],
      ["game", "경기", false],
      ["team", "팀", false],
      ["admin", "관리", true],
    ]);
  });

  it("기존 메뉴 8개의 주소가 그대로 들어 있다", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const href of ["/", "/records", "/lineup", "/compare", "/team-analysis", "/situations/hub", "/upload", "/schedule"]) {
      expect(hrefs, href).toContain(href);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("묶음의 첫 화면(home)은 그 묶음 안에 있다", () => {
    for (const group of NAV_GROUPS) expect(group.items.map((i) => i.href), group.id).toContain(group.home);
  });

  it("주소 → 묶음", () => {
    const at = (path: string) => {
      const found = locateNav(path);
      return found ? [found.group.id, found.item?.href ?? null] : null;
    };
    expect(at("/")).toEqual(["team", "/"]);
    expect(at("/records")).toEqual(["team", "/records"]);
    expect(at("/team-analysis")).toEqual(["team", "/team-analysis"]);
    expect(at("/lineup")).toEqual(["player", "/lineup"]);
    expect(at("/compare")).toEqual(["player", "/compare"]);
    expect(at("/players/12")).toEqual(["player", null]);
    expect(at("/schedule")).toEqual(["game", "/schedule"]);
    expect(at("/calendar")).toEqual(["game", "/schedule"]);
    expect(at("/situations/hub")).toEqual(["game", "/situations/hub"]);
    expect(at("/situations/offense")).toEqual(["game", "/situations/hub"]);
    expect(at("/situations/7")).toEqual(["game", "/situations/hub"]);
    expect(at("/game-review")).toEqual(["game", "/game-review"]);
    expect(at("/upload")).toEqual(["admin", "/upload"]);
    expect(at("/files")).toEqual(["admin", "/upload"]);
    expect(at("/import")).toEqual(["admin", "/upload"]);
    expect(at("/login")).toBeNull();
    expect(at("/recordsX")).toBeNull();
  });

  it("검색 팔레트의 화면은 모두 어느 묶음엔가 속한다", () => {
    for (const screen of SCREENS) expect(locateNav(screen.href)?.group.id, screen.href).toBe(screen.group);
  });
});

describe("현재 위치", () => {
  const labels = (path: string, lang: "ko" | "en" = "ko", leaf?: string) => buildCrumbs(path, lang, leaf).map((c) => c.label);

  it("팀 › 선수 › 가선수", () => {
    expect(labels("/players/1", "ko", "가선수")).toEqual(["팀", "선수", "가선수"]);
    expect(labels("/players/1", "en", "Ga Player")).toEqual(["Team", "Players", "Ga Player"]);
  });

  it("묶음별", () => {
    expect(labels("/records")).toEqual(["팀", "기록"]);
    expect(labels("/")).toEqual(["팀", "대시보드"]);
    expect(labels("/schedule")).toEqual(["팀", "경기", "일정"]);
    expect(labels("/situations/offense")).toEqual(["팀", "경기", "상황 센터"]);
    expect(labels("/compare")).toEqual(["팀", "선수", "선수 비교"]);
    expect(labels("/upload")).toEqual(["팀", "관리", "업로드"]);
    expect(labels("/login")).toEqual([]);
  });

  it("3단계 이하이고, 마지막 칸은 링크가 아니다", () => {
    for (const path of ["/", "/records", "/players/3", "/situations/hub", "/game-review", "/files"]) {
      const crumbs = buildCrumbs(path, "ko", "가선수");
      expect(crumbs.length, path).toBeLessThanOrEqual(3);
      expect(crumbs[crumbs.length - 1].href, path).toBeUndefined();
      for (const crumb of crumbs.slice(0, -1)) expect(crumb.href, path).toBeTruthy();
    }
  });
});

describe("즐겨찾기", () => {
  const ga: FavoritePlayer = { id: 1, name: "가선수", number: 7, isPitcher: false };
  const na: FavoritePlayer = { id: 2, name: "나선수", number: 18, isPitcher: true };
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
  };

  it("추가하고 뺀다", () => {
    expect(toggleFavoriteIn([], ga)).toEqual([ga]);
    expect(toggleFavoriteIn([ga], na)).toEqual([na, ga]);
    expect(toggleFavoriteIn([na, ga], ga)).toEqual([na]);
  });

  it("저장소에 남고 다시 읽힌다", () => {
    const store = memory();
    expect(readFavorites(store)).toEqual([]);
    toggleFavorite(ga, store);
    toggleFavorite(na, store);
    expect(readFavorites(store)).toEqual([na, ga]);
    expect(JSON.parse(store.data.get(FAVORITES_KEY)!)).toHaveLength(2);
    toggleFavorite(na, store);
    expect(readFavorites(store)).toEqual([ga]);
  });

  it("저장소가 없거나 고장 나도 오류 없이 빈 목록", () => {
    expect(readFavorites(null)).toEqual([]);
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readFavorites(broken)).toEqual([]);
    expect(() => toggleFavorite(ga, broken)).not.toThrow();
    expect(toggleFavorite(ga, null)).toEqual([ga]);
  });

  it("형식이 어긋난 저장 값은 버린다", () => {
    expect(parseFavorites("not json")).toEqual([]);
    expect(parseFavorites('{"id":1}')).toEqual([]);
    expect(parseFavorites(JSON.stringify([ga, null, { id: "x", name: "?" }, { id: 3 }, ga]))).toEqual([ga]);
    expect(parseFavorites(JSON.stringify([{ id: 5, name: "마선수" }]))).toEqual([{ id: 5, name: "마선수", number: null, isPitcher: false }]);
  });

  it("개수 제한", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `선수${i + 1}`, number: i, isPitcher: false }));
    expect(parseFavorites(JSON.stringify(many))).toHaveLength(MAX_FAVORITES);
    expect(many.reduce((list, player) => toggleFavoriteIn(list, player), [] as FavoritePlayer[])).toHaveLength(MAX_FAVORITES);
  });
});
