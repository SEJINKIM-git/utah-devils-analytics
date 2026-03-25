import { ThemeProvider } from '@/app/components/ThemeProvider';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import MobileNav from '@/app/components/MobileNav';
import SeasonNavLinks from '@/app/components/SeasonNavLinks';
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://utah-devils-analytics.vercel.app"),
  title: "Devils Insight AI",
  description: "Devils Insight AI · Utah Devils Baseball analytics and operations platform",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Devils Insight AI",
    description: "Devils Insight AI · Utah Devils Baseball analytics and operations platform",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Devils Insight AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#141B3D",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("lang")?.value || "ko";

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* FOUC 방지: 페이지 로드 전 테마 적용 */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){var t=localStorage.getItem('ud-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`
        }} />
      </head>
      <body className="app-body">
        <ThemeProvider>
          {/* 상단 네비게이션 — ThemeToggle을 오른쪽에 배치 */}
          <nav
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              padding: "12px 18px",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              background: "linear-gradient(180deg, rgba(12,18,38,0.94), rgba(12,18,38,0.82))",
              boxShadow: "0 18px 48px rgba(5, 10, 24, 0.26)",
            }}
          >
            <div
              style={{
                maxWidth: 1320,
                margin: "0 auto",
                minHeight: 64,
                borderRadius: 22,
                padding: "0 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                background: "linear-gradient(180deg, rgba(25,31,51,0.92), rgba(21,27,47,0.88))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px rgba(6,10,24,0.24)",
              }}
            >
              {/* 왼쪽: 로고 + 메뉴 */}
              <div style={{ display: "flex", alignItems: "center", gap: 26, minWidth: 0 }}>
                <Link
                  href="/"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 18,
                    color: "var(--brand-coral)",
                    textDecoration: "none",
                    letterSpacing: "-0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(255,180,171,0.26), rgba(220,38,38,0.9))",
                      boxShadow: "0 10px 24px rgba(220,38,38,0.22)",
                    }}
                  >
                    ⚾
                  </span>
                  Devils Insight AI
                </Link>
                <div style={{ minWidth: 0 }}>
                  <SeasonNavLinks />
                </div>
              </div>

              {/* 오른쪽: 다크/라이트 모드 토글 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <ThemeToggle />
              </div>
            </div>
          </nav>

          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at 15% 20%, rgba(164,201,255,0.06), transparent 24%), radial-gradient(circle at 82% 12%, rgba(255,180,171,0.08), transparent 28%), radial-gradient(circle at 52% 100%, rgba(220,38,38,0.08), transparent 32%)",
              zIndex: 0,
            }}
          />

          {/* 페이지 콘텐츠 */}
          <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
          <MobileNav lang={lang} />
        </ThemeProvider>
      </body>
    </html>
  );
}
