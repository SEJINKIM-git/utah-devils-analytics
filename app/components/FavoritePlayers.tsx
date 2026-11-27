"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FAVORITES_EVENT, readFavorites, type FavoritePlayer } from "@/lib/favorites";
import { metricShortName } from "@/lib/metrics";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import type { Lang } from "@/lib/translations";

/**
 * 대시보드 위쪽의 즐겨찾기 선수 카드 (블룸버그의 Launchpad).
 * 선수마다 대표 지표 하나: 타자는 OPS, 투수는 ERA. 즐겨찾기가 없으면 아무것도 그리지 않는다.
 */
export default function FavoritePlayers({ season, lang }: { season: string; lang: Lang }) {
  const [favorites, setFavorites] = useState<FavoritePlayer[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});

  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    sync();
    window.addEventListener(FAVORITES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setValues({});
    for (const player of favorites) {
      const params = new URLSearchParams({ mode: "point", target: `player:${player.id}`, code: player.isPitcher ? "ERA" : "OPS", season });
      fetch(`/api/metrics?${params}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { display?: string } | null) => alive && setValues((prev) => ({ ...prev, [player.id]: data?.display ?? "---" })))
        .catch(() => alive && setValues((prev) => ({ ...prev, [player.id]: "---" })));
    }
    return () => {
      alive = false;
    };
  }, [favorites, season]);

  if (favorites.length === 0) return null;

  return (
    <section className="fav-strip" aria-labelledby="fav-strip-title" data-testid="favorite-players">
      <h2 id="fav-strip-title" className="fav-strip-title">{lang === "ko" ? "즐겨찾기 선수" : "Favorite players"}</h2>
      <div className="fav-cards">
        {favorites.map((player) => {
          const code = player.isPitcher ? "ERA" : "OPS";
          return (
            <Link key={player.id} href={`/players/${player.id}?season=${encodeURIComponent(season)}`} className="fav-card">
              <span className="fav-card-name">{getPlayerDisplayName(player.name, lang)}</span>
              <span className="fav-card-metric">
                <span>{metricShortName(code, lang)}</span>
                <span className="fav-card-value num">{values[player.id] ?? "…"}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
