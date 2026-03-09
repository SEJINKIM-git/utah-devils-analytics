'use client';

/**
 * components/ThemeToggle.tsx
 *
 * 수정 사항:
 *  - .jsx → .tsx 변환
 *  - import 경로 대소문자 수정: './ThemeProvider' (ThemeProvider.tsx와 일치)
 */

import { useTheme } from './Themeprovider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'var(--card-bg)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}
    >
      <span style={{ fontSize: '15px' }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span>{theme === 'dark' ? '라이트' : '다크'}</span>
    </button>
  );
}
