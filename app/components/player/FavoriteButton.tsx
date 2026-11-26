"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { readFavorites, toggleFavorite, type FavoritePlayer } from "@/lib/favorites";
import type { Lang } from "@/lib/translations";

/** 선수 페이지의 별 버튼. 누르면 대시보드 위쪽 즐겨찾기에 이 선수가 나온다. */
export default function FavoriteButton({ player, lang }: { player: FavoritePlayer; lang: Lang }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(readFavorites().some((entry) => entry.id === player.id));
  }, [player.id]);

  const label = lang === "ko" ? (on ? "즐겨찾기에서 빼기" : "즐겨찾기에 추가") : on ? "Remove from favorites" : "Add to favorites";

  return (
    <button
      type="button"
      className="fav-button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      data-testid="favorite-toggle"
      onClick={() => setOn(toggleFavorite(player).some((entry) => entry.id === player.id))}
    >
      <Star size={20} strokeWidth={1.8} aria-hidden="true" fill={on ? "currentColor" : "none"} />
    </button>
  );
}
