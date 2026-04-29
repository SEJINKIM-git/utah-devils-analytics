"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import type { Lang } from "@/lib/translations";

const NAV_ITEMS = [
  { href: "/", labelKo: "대시보드", labelEn: "Dashboard" },
  { href: "/compare", labelKo: "선수 비교", labelEn: "Player Compare" },
  { href: "/lineup", labelKo: "라인업", labelEn: "Lineup" },
  { href: "/schedule", labelKo: "일정", labelEn: "Schedule" },
  { href: "/team-analysis", labelKo: "AI 분석", labelEn: "AI Analysis" },
  { href: "/game-review", labelKo: "경기 리뷰", labelEn: "Game Review" },
];

function buildHref(path: string, season: string | null) {
  if (!season) return path;
  const params = new URLSearchParams();
  params.set("season", season);
  return `${path}?${params.toString()}`;
}

function readActiveSeasonCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_SEASON_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SeasonNavLinks({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || readActiveSeasonCookie();
  const isKo = lang === "ko";

  return (
    <div className="app-nav-links">
      {NAV_ITEMS.map(({ href, labelKo, labelEn }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={buildHref(href, season)}
            className={active ? "app-nav-link active" : "app-nav-link"}
          >
            {isKo ? labelKo : labelEn}
          </Link>
        );
      })}
      <Link
        href={buildHref("/upload", season)}
        className="app-nav-upload"
      >
        {isKo ? "📤 업로드" : "📤 Upload"}
      </Link>
    </div>
  );
}
