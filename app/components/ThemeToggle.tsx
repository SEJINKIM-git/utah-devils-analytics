'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 20,
        border: 'none',
        /* CSS var()에 의존하지 않는 solid 색상 — 배경과 항상 구분됨 */
        background: isDark ? '#334155' : '#e2e8f0',
        color: isDark ? '#f1f5f9' : '#1e293b',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        flexShrink: 0,
        transition: 'background 0.2s, color 0.2s',
        boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
          : 'inset 0 1px 0 rgba(0,0,0,0.06)',
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{isDark ? '☀️' : '🌙'}</span>
      <span>{isDark ? '라이트' : '다크'}</span>
    </button>
  );
}