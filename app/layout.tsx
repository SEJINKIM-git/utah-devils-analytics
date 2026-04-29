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
  const lang = cookieStore.get("lang")?.value === "en" ? "en" : "ko";

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* FOUC 방지: 페이지 로드 전 테마 적용 */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){var t=localStorage.getItem('ud-theme')==='light'?'light':'dark';var root=document.documentElement;root.setAttribute('data-theme',t);root.style.colorScheme=t;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute('content',t==='light'?'#eef3fb':'#0c1226');}})();`
        }} />
      </head>
      <body className="app-body">
        <ThemeProvider>
          {/* 상단 네비게이션 — ThemeToggle을 오른쪽에 배치 */}
          <nav className="app-top-nav">
            <div
              className="app-top-nav-frame"
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
                  <SeasonNavLinks lang={lang} />
                </div>
              </div>

              {/* 오른쪽: 다크/라이트 모드 토글 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <ThemeToggle lang={lang} />
              </div>
            </div>
          </nav>

          <div
            aria-hidden="true"
            className="app-ambient-glow"
            style={{
              position: "fixed",
              inset: 0,
              pointerEvents: "none",
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
