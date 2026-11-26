"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Brain,
  Zap,
  Upload,
  CalendarDays,
  Sparkles,
  BarChart2,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import type { Lang } from "@/lib/translations";
import AdminStatus from "@/app/components/AdminStatus";
import { useAdminSession } from "@/app/components/useAdminSession";
import { NAV_GROUPS, locateNav, type NavIcon } from "@/lib/nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  users: Users,
  compare: ArrowLeftRight,
  calendar: CalendarDays,
  zap: Zap,
  review: ClipboardList,
  dashboard: LayoutDashboard,
  records: BarChart2,
  brain: Brain,
  upload: Upload,
};

function buildHref(path: string, season: string | null): string {
  if (!season) return path;
  return `${path}?season=${encodeURIComponent(season)}`;
}

/** PC 메뉴: 선수 · 경기 · 팀 묶음 제목 아래 화면을 나열한다. 관리 묶음은 로그인한 운영진에게만 보인다. */
export default function Sidebar({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const season = searchParams.get("season");
  const isKo = lang === "ko";
  const session = useAdminSession();
  const current = locateNav(pathname);
  const groups = NAV_GROUPS.filter((group) => !group.adminOnly || session?.loggedIn);

  return (
    <aside className="sidebar">
      {/* 브랜드 */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-wrap">
          <Image
            src="/logos/cap-logo.png"
            alt="Utah Devils"
            width={26}
            height={26}
            style={{ borderRadius: 6, display: "block" }}
          />
        </div>
        <div>
          <div className="sidebar-brand-name">Utah Devils</div>
          <div className="sidebar-brand-sub">DEVILS INSIGHT AI</div>
        </div>
      </div>

      {/* 내비게이션 */}
      <nav className="sidebar-nav" aria-label={isKo ? "메인 네비게이션" : "Main navigation"}>
        {groups.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`sidebar-group-${group.id}`} className="sidebar-group">
            <p id={`sidebar-group-${group.id}`} className="sidebar-section-label">
              {isKo ? group.labelKo : group.labelEn}
            </p>
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = current?.item?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={buildHref(item.href, season)}
                  className={`sidebar-nav-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{isKo ? item.labelKo : item.labelEn}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* CTA */}
      <div className="sidebar-footer">
        <Link
          href={buildHref("/team-analysis", season)}
          className="sidebar-cta"
        >
          <Sparkles size={15} strokeWidth={1.8} />
          {isKo ? "시즌 리포트 생성" : "Generate Report"}
        </Link>
        <AdminStatus isKo={isKo} />
      </div>
    </aside>
  );
}
