'use client';

import { useTheme } from './ThemeProvider';
import type { Lang } from '@/lib/translations';

export function ThemeToggle({ lang }: { lang: Lang }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = lang === 'ko'
    ? (isDark ? '라이트' : '다크')
    : (isDark ? 'Light' : 'Dark');
  const ariaLabel = lang === 'ko'
    ? (isDark ? '라이트 모드로 전환' : '다크 모드로 전환')
    : (isDark ? 'Switch to light mode' : 'Switch to dark mode');

  return (
    <button
      onClick={toggleTheme}
      aria-label={ariaLabel}
      className="app-icon-button"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        borderRadius: 14,
        border: '1px solid var(--icon-button-border)',
        background: 'var(--icon-button-bg)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
        transition: 'background 0.2s, color 0.2s',
        boxShadow: 'var(--icon-button-shadow)',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{isDark ? '☀️' : '🌙'}</span>
      <span>{label}</span>
    </button>
  );
}
