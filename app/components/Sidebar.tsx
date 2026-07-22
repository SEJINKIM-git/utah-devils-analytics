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
} from "lucide-react";
import type { Lang } from "@/lib/translations";

const NAV_ITEMS = [
  { href: "/",               icon: LayoutDashboard, labelKo: "대시보드",  labelEn: "Dashboard"  },
  { href: "/records",        icon: BarChart2,        labelKo: "기록",      labelEn: "Records"    },
  { href: "/lineup",         icon: Users,           labelKo: "선수단",    labelEn: "Roster"     },
  { href: "/compare",        icon: ArrowLeftRight,  labelKo: "선수 비교", labelEn: "Compare"    },
  { href: "/team-analysis",  icon: Brain,           labelKo: "AI 분석",   labelEn: "AI Analysis"},
  { href: "/situations/hub", icon: Zap,             labelKo: "상황 센터", labelEn: "Situations" },
  { href: "/upload",         icon: Upload,          labelKo: "업로드",    labelEn: "Upload"     },
  { href: "/schedule",       icon: CalendarDays,    labelKo: "일정",      labelEn: "Schedule"   },
] as const;

function buildHref(path: string, season: string | null): string {
  if (!season) return path;
  return `${path}?season=${encodeURIComponent(season)}`;
}

export default function Sidebar({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const season = searchParams.get("season");
  const isKo = lang === "ko";

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
        <p className="sidebar-section-label">{isKo ? "메뉴" : "MENU"}</p>
        {NAV_ITEMS.map(({ href, icon: Icon, labelKo, labelEn }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={buildHref(href, season)}
              className={`sidebar-nav-item${active ? " active" : ""}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{isKo ? labelKo : labelEn}</span>
            </Link>
          );
        })}
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
      </div>
    </aside>
  );
}
