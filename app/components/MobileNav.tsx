"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Search, Settings, Shield, Users, type LucideIcon } from "lucide-react";
import { useCommand } from "@/app/components/command/CommandProvider";
import { useAdminSession } from "@/app/components/useAdminSession";
import { NAV_GROUPS, locateNav, type NavGroupId } from "@/lib/nav";

const GROUP_ICONS: Record<NavGroupId, LucideIcon> = {
  player: Users,
  game: CalendarDays,
  team: Shield,
  admin: Settings,
};

/** 휴대폰 하단 메뉴: 선수 · 경기 · 팀 · 검색 네 칸 (로그인한 운영진에게는 관리 칸이 하나 더 보인다). */
export default function MobileNav({ lang }: { lang: "ko" | "en" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ko = lang === "ko";
  const { openPalette, season: activeSeason } = useCommand();
  const session = useAdminSession();
  const season = searchParams.get("season") || activeSeason;
  const current = locateNav(pathname)?.group.id ?? null;
  const groups = NAV_GROUPS.filter((group) => !group.adminOnly || session?.loggedIn);

  const buildHref = (path: string) => (season ? `${path}?season=${encodeURIComponent(season)}` : path);

  return (
    <>
      <nav className="mobile-nav" aria-label={ko ? "메인 메뉴" : "Main menu"}>
        <div className="mobile-nav-row">
          {groups.map((group) => {
            const active = current === group.id;
            const Icon = GROUP_ICONS[group.id];
            return (
              <Link
                key={group.id}
                href={buildHref(group.home)}
                className={active ? "mobile-nav-item active" : "mobile-nav-item"}
                aria-current={active ? "true" : undefined}
                data-testid={`mobile-nav-${group.id}`}
              >
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                <span>{ko ? group.labelKo : group.labelEn}</span>
              </Link>
            );
          })}
          <button type="button" onClick={openPalette} aria-haspopup="dialog" data-testid="open-search-mobile" className="mobile-nav-item mobile-nav-search">
            <Search size={22} strokeWidth={1.8} aria-hidden="true" />
            <span>{ko ? "검색" : "Search"}</span>
          </button>
        </div>
      </nav>
      <div className="mobile-nav-spacer" />
    </>
  );
}
