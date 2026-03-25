'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="app-icon-button"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        background: isDark
          ? 'linear-gradient(180deg, rgba(35,42,67,0.92), rgba(24,31,52,0.92))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(239,244,255,0.94))',
        color: isDark ? '#f1f5f9' : '#142033',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
        transition: 'background 0.2s, color 0.2s',
        boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 36px rgba(6,10,24,0.18)'
          : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 36px rgba(15,23,42,0.08)',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{isDark ? '☀️' : '🌙'}</span>
      <span>{isDark ? '라이트' : '다크'}</span>
    </button>
  );
}
