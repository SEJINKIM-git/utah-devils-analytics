/**
 * 즐겨찾기 선수. 로그인 없이 이 브라우저의 localStorage에만 저장한다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드, 저장소 차단)에서는 빈 목록으로 조용히 동작한다.
 */
export type FavoritePlayer = { id: number; name: string; number: number | null; isPitcher: boolean };

export const FAVORITES_KEY = "ud-favorites-v1";
export const FAVORITES_EVENT = "ud:favorites-change";
export const MAX_FAVORITES = 12;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const storage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** 저장된 글자 → 목록. 형식이 어긋난 항목은 버린다. */
export function parseFavorites(raw: string | null | undefined): FavoritePlayer[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const list: FavoritePlayer[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { id, name, number, isPitcher } = entry as Record<string, unknown>;
      if (typeof id !== "number" || !Number.isFinite(id) || typeof name !== "string" || !name || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, name, number: typeof number === "number" ? number : null, isPitcher: Boolean(isPitcher) });
    }
    return list.slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

/** 있으면 빼고 없으면 맨 앞에 넣는다 */
export function toggleFavoriteIn(list: FavoritePlayer[], player: FavoritePlayer): FavoritePlayer[] {
  return list.some((entry) => entry.id === player.id)
    ? list.filter((entry) => entry.id !== player.id)
    : [player, ...list].slice(0, MAX_FAVORITES);
}

export function readFavorites(store: StorageLike | null = storage()): FavoritePlayer[] {
  try {
    return parseFavorites(store?.getItem(FAVORITES_KEY));
  } catch {
    return [];
  }
}

export function toggleFavorite(player: FavoritePlayer, store: StorageLike | null = storage()): FavoritePlayer[] {
  const next = toggleFavoriteIn(readFavorites(store), player);
  try {
    store?.setItem(FAVORITES_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(FAVORITES_EVENT));
  } catch {
    // 저장하지 못해도 화면은 그대로 동작한다
  }
  return next;
}
