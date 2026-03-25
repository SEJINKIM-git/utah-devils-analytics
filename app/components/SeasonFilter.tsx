"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";

function readActiveSeasonCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_SEASON_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SeasonFilter({
  seasons,
  basePath = "/",
}: {
  seasons: string[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("season") || readActiveSeasonCookie() || seasons[0] || "2025";

  const handleChange = (season: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", season);
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <div className="app-season-filter">
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => handleChange(s)}
          className={current === s ? "app-season-chip active" : "app-season-chip"}
        >
          {s === "Career" ? "통산" : s}
        </button>
      ))}
    </div>
  );
}
