'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

interface ThemeProviderProps {
  children: ReactNode;
}

/* ── 다크 / 라이트 CSS 변수 ─────────────────────────────────────────── */
const DARK_VARS: Record<string, string> = {
  '--bg':           '#0E1428',
  '--bg-secondary': '#141B3D',
  '--card-bg':      '#1a2147',
  '--card-hover':   '#1e2850',
  '--card-item':    '#1e2850',   // 드롭다운 아이템 배경 (card-bg보다 밝게)
  '--border':       'rgba(255,255,255,0.08)',
  '--text':         '#E2E8F0',
  '--text-muted':   '#94a3b8',
  '--text-dim':     '#64748b',
  '--accent':       '#DC2626',
  '--success':      '#22c55e',
  '--warning':      '#eab308',
  '--shadow':       '0 4px 24px rgba(0,0,0,0.4)',
  '--input-bg':     'rgba(255,255,255,0.05)',
  '--nav-bg':       '#141B3D',
};

const LIGHT_VARS: Record<string, string> = {
  '--bg':           '#ffffff',
  '--bg-secondary': '#f1f5f9',
  '--card-bg':      '#f8fafc',
  '--card-hover':   '#f1f5f9',
  '--card-item':    '#ffffff',   // 드롭다운 아이템 배경 (흰색)
  '--border':       'rgba(0,0,0,0.10)',
  '--text':         '#1e293b',
  '--text-muted':   '#475569',
  '--text-dim':     '#94a3b8',
  '--accent':       '#DC2626',
  '--success':      '#16a34a',
  '--warning':      '#ca8a04',
  '--shadow':       '0 4px 24px rgba(0,0,0,0.10)',
  '--input-bg':     'rgba(0,0,0,0.04)',
  '--nav-bg':       '#1e40af',
};

/* CSS 변수를 <html> 요소에 직접 주입 + body 배경/색상 즉시 적용 */
function applyTheme(theme: Theme) {
  const vars = theme === 'dark' ? DARK_VARS : LIGHT_VARS;
  const root = document.documentElement;

  // 1) CSS 변수 주입
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // 2) data-theme 속성 (기존 CSS 셀렉터용)
  root.setAttribute('data-theme', theme);

  // 3) body 배경/글자색 직접 설정 — globals.css 하드코딩 우선순위 제거
  document.body.style.setProperty('background-color', vars['--bg'], 'important');
  document.body.style.setProperty('color', vars['--text'], 'important');
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>('dark');

  // 마운트 시: localStorage 저장값 읽어서 즉시 적용
  useEffect(() => {
    const saved = localStorage.getItem('ud-theme') as Theme | null;
    const initial: Theme = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ud-theme', next);
      applyTheme(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);