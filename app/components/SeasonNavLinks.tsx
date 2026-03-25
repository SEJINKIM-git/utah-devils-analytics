"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";

const NAV_ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/compare", label: "선수 비교" },
  { href: "/lineup", label: "라인업" },
  { href: "/schedule", label: "일정" },
  { href: "/team-analysis", label: "AI 분석" },
  { href: "/game-review", label: "경기 리뷰" },
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

export default function SeasonNavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || readActiveSeasonCookie();

  return (
    <div className="app-nav-links">
      {NAV_ITEMS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={buildHref(href, season)}
            className={active ? "app-nav-link active" : "app-nav-link"}
          >
            {label}
          </Link>
        );
      })}
      <Link
        href={buildHref("/upload", season)}
        className="app-nav-upload"
      >
        📤 업로드
      </Link>
    </div>
  );
}
