"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";

const NAV_ITEMS = [
  { href: "/", icon: "📊", labelKo: "대시보드", labelEn: "Stats" },
  { href: "/lineup", icon: "⚾", labelKo: "라인업", labelEn: "Lineup" },
  { href: "/schedule", icon: "📅", labelKo: "일정", labelEn: "Schedule" },
  { href: "/compare", icon: "⚔️", labelKo: "비교", labelEn: "Compare" },
  { href: "/upload", icon: "📤", labelKo: "업로드", labelEn: "Upload" },
];

export default function MobileNav({ lang }: { lang: string }) {
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
      {/* 모바일 하단 내비게이션 */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9990,
          background: "linear-gradient(180deg, rgba(17,25,51,0.92), rgba(12,18,38,0.96))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 -18px 40px rgba(6,10,24,0.24)",
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
                <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
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

      {/* 하단 네비 높이만큼 패딩 추가 */}
      <div className="mobile-nav-spacer" style={{ height: 0 }} />

      <style>{`
        .mobile-nav {
          display: none !important;
        }
        @media (max-width: 768px) {
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
