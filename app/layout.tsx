import { ThemeProvider } from '@/app/components/ThemeProvider';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import MobileNav from '@/app/components/MobileNav';
import SeasonNavLinks from '@/app/components/SeasonNavLinks';
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
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
      <body>
        <ThemeProvider>
          {/* 상단 네비게이션 — ThemeToggle을 오른쪽에 배치 */}
          <nav style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            background: 'var(--nav-bg, #141B3D)',
            borderBottom: '1px solid var(--border)',
            padding: '0 16px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {/* 왼쪽: 로고 + 메뉴 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <Link href="/" style={{ fontWeight: 800, fontSize: 16, color: '#DC2626', textDecoration: 'none', letterSpacing: '-0.3px' }}>
                ⚾ Devils Insight AI
              </Link>
              <SeasonNavLinks />
            </div>

            {/* 오른쪽: 다크/라이트 모드 토글 */}
            <ThemeToggle />
          </nav>

          {/* 페이지 콘텐츠 */}
          {children}
          <MobileNav lang={lang} />
        </ThemeProvider>
      </body>
    </html>
  );
}
