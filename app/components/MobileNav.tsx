"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", icon: "📊", labelKo: "대시보드", labelEn: "Stats" },
  { href: "/lineup", icon: "⚾", labelKo: "라인업", labelEn: "Lineup" },
  { href: "/schedule", icon: "📅", labelKo: "일정", labelEn: "Schedule" },
  { href: "/compare", icon: "⚔️", labelKo: "비교", labelEn: "Compare" },
  { href: "/upload", icon: "📤", labelKo: "업로드", labelEn: "Upload" },
];

export default function MobileNav({ lang }: { lang: string }) {
  const pathname = usePathname();
  const ko = lang === "ko";

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
          background: "rgba(10, 14, 23, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        className="mobile-nav"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "6px 0 2px",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  padding: "6px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: active ? "#60a5fa" : "rgba(255,255,255,0.35)",
                  transition: "color 0.15s",
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
                      background: "#60a5fa",
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