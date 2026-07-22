"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ArrowLeftRight,
  Zap,
  Upload,
  BarChart2,
} from "lucide-react";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";

const NAV_ITEMS = [
  { href: "/",               icon: LayoutDashboard, labelKo: "대시보드",  labelEn: "Dashboard"  },
  { href: "/records",        icon: BarChart2,        labelKo: "기록",      labelEn: "Records"    },
  { href: "/lineup",         icon: Users,           labelKo: "선수단",    labelEn: "Roster"     },
  { href: "/schedule",       icon: CalendarDays,    labelKo: "일정",      labelEn: "Schedule"   },
  { href: "/compare",        icon: ArrowLeftRight,  labelKo: "선수 비교", labelEn: "Compare"    },
  { href: "/situations/hub", icon: Zap,             labelKo: "상황",      labelEn: "Situations" },
  { href: "/upload",         icon: Upload,          labelKo: "업로드",    labelEn: "Upload"     },
];

export default function MobileNav({ lang }: { lang: "ko" | "en" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ko = lang === "ko";
  const season = searchParams.get("season") || (() => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_SEASON_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  })();

  const buildHref = (path: string) => {
    if (!season) return path;
    const params = new URLSearchParams();
    params.set("season", season);
    return `${path}?${params.toString()}`;
  };

  return (
    <>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9990,
          background: "var(--mobile-nav-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--border)",
          boxShadow: "var(--mobile-nav-shadow)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        className="mobile-nav"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "8px 8px 4px",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={buildHref(item.href)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "8px 12px",
                  borderRadius: 14,
                  textDecoration: "none",
                  color: active ? "var(--brand-coral)" : "var(--text-dim)",
                  background: active ? "rgba(255,180,171,0.08)" : "transparent",
                  transition: "color 0.15s, background 0.15s",
                  minWidth: 54,
                }}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                    letterSpacing: 0.2,
                  }}
                >
                  {ko ? item.labelKo : item.labelEn}
                </span>
                {active && (
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--brand-coral)",
                      marginTop: 1,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mobile-nav-spacer" style={{ height: 0 }} />

      <style>{`
        .mobile-nav {
          display: none !important;
        }
        @media (max-width: 880px) {
          .mobile-nav {
            display: block !important;
          }
          .mobile-nav-spacer {
            height: 72px !important;
          }
        }
      `}</style>
    </>
  );
}
