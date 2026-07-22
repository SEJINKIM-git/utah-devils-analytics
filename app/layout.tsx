import { ThemeProvider } from '@/app/components/ThemeProvider';
import MobileNav from '@/app/components/MobileNav';
import Sidebar from '@/app/components/Sidebar';
import Topbar from '@/app/components/Topbar';
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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
        {/* Google Fonts: Inter + Noto Sans KR */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="app-body">
        <ThemeProvider>
          <div
            aria-hidden="true"
            className="app-ambient-glow"
            style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
          />
          <div className="layout-shell">
            <Sidebar lang={lang} />
            <div className="layout-content">
              <Topbar lang={lang} />
              <main className="layout-main">{children}</main>
            </div>
          </div>
          <MobileNav lang={lang} />
        </ThemeProvider>
      </body>
    </html>
  );
}
