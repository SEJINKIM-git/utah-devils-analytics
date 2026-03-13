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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => handleChange(s)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: current === s ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
            background: current === s ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
            color: current === s ? "#60a5fa" : "rgba(255,255,255,0.5)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {s === "Career" ? "통산" : s}
        </button>
      ))}
    </div>
  );
}
