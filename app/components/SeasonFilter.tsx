"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import type { Lang } from "@/lib/translations";

function readActiveSeasonCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_SEASON_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SeasonFilter({
  seasons,
  basePath = "/",
  lang = "ko",
  termsBySeason,
  currentTerm = null,
}: {
  seasons: string[];
  basePath?: string;
  lang?: Lang;
  /** 연도별로 고를 수 있는 학기(Spring/Fall…). 주어지면 연도를 누를 때 학기 선택 메뉴가 열린다 */
  termsBySeason?: Record<string, string[]>;
  currentTerm?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("season") || readActiveSeasonCookie() || seasons[0] || "2025";
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openSeason) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenSeason(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSeason(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [openSeason]);

  const navigate = (season: string, term: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", season);
    if (term) params.set("term", term);
    else params.delete("term");
    setOpenSeason(null);
    router.push(`${basePath}?${params.toString()}`);
  };

  const handleClick = (season: string) => {
    const terms = termsBySeason?.[season] || [];
    if (terms.length === 0) {
      navigate(season, null);
      return;
    }
    setOpenSeason((prev) => (prev === season ? null : season));
  };

  return (
    <div ref={rootRef} className="app-season-filter">
      {seasons.map((s) => {
        const terms = termsBySeason?.[s] || [];
        const isActive = current === s;
        const label = s === "Career" ? (lang === "ko" ? "통산" : "Career") : s;
        return (
          <div key={s} style={{ position: "relative" }}>
            <button
              onClick={() => handleClick(s)}
              className={isActive ? "app-season-chip active" : "app-season-chip"}
              aria-haspopup={terms.length > 0 ? "menu" : undefined}
              aria-expanded={terms.length > 0 ? openSeason === s : undefined}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {label}
              {isActive && currentTerm ? ` · ${currentTerm}` : ""}
              {terms.length > 0 && <ChevronDown size={13} strokeWidth={2.2} />}
            </button>

            {openSeason === s && (
              <div
                role="menu"
                className="app-glass-panel"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 30,
                  minWidth: 168,
                  padding: 8,
                  borderRadius: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  background: "var(--surface-raised, var(--surface))",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", padding: "2px 6px" }}>
                  {lang === "ko" ? `${label} 학기 선택` : `${label} term`}
                </div>
                {terms.map((term) => (
                  <button
                    key={term}
                    role="menuitem"
                    onClick={() => navigate(s, term)}
                    className={isActive && currentTerm === term ? "app-season-chip active" : "app-season-chip"}
                    style={{ textAlign: "left" }}
                  >
                    {term}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => navigate(s, null)}
                  className={isActive && !currentTerm ? "app-season-chip active" : "app-season-chip"}
                  style={{ textAlign: "left", opacity: 0.85 }}
                >
                  {lang === "ko" ? "시즌 전체" : "Full season"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
