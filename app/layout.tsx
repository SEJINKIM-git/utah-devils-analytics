import { ThemeProvider } from '@/app/components/ThemeProvider';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Utah Devils Baseball",
  description: "University of Utah Baseball Club · EST. 2022",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Utah Devils Baseball",
    description: "University of Utah Baseball Club · Team Dashboard",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Utah Devils",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#141B3D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
                ⚾ Utah Devils
              </Link>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { href: '/',              label: '대시보드' },
                  { href: '/compare',       label: '선수 비교' },
                  { href: '/lineup',        label: '라인업' },
                  { href: '/schedule',      label: '일정' },
                  { href: '/team-analysis', label: 'AI 분석' },
                  { href: '/game-review',   label: '경기 리뷰' },
                ].map(({ href, label }) => (
                  <Link key={href} href={href} style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                  }}>
                    {label}
                  </Link>
                ))}
                <Link href="/upload" style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#60a5fa',
                  textDecoration: 'none',
                  background: 'rgba(59,130,246,0.14)',
                  border: '1px solid rgba(59,130,246,0.28)',
                }}>
                  📤 업로드
                </Link>
              </div>
            </div>

            {/* 오른쪽: 다크/라이트 모드 토글 */}
            <ThemeToggle />
          </nav>

          {/* 페이지 콘텐츠 */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}