'use client';

/**
 * components/ThemeProvider.tsx
 *
 * 수정 사항:
 *  - .jsx → .tsx 변환 (프로젝트 TypeScript 환경 맞춤)
 *  - 파일명 대소문자 수정: Themeprovider → ThemeProvider (ThemeToggle import 경로 일치)
 *  - useState(null) 타입 불일치 수정:
 *      이전: useState(null) → setTheme의 타입이 SetStateAction<null>이 되어
 *            setTheme('dark') 호출 시 TS 에러 발생
 *      수정: useState<Theme>('dark') 명시적 타입 파라미터 사용
 *  - createContext 타입 명시
 *  - children prop에 React.ReactNode 타입 추가
 *
 * layout.tsx에 FOUC 방지 스크립트 추가 필요:
 *   <script dangerouslySetInnerHTML={{ __html:
 *     `(function(){var t=localStorage.getItem('ud-theme')||'dark';
 *      document.documentElement.setAttribute('data-theme',t);})();`
 *   }} />
 */

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

export function ThemeProvider({ children }: ThemeProviderProps) {
  // FIX: useState<Theme>('dark') — 명시적 타입으로 SetStateAction<null> 에러 방지
  // 초기값을 'dark'로 설정하여 SSR과 클라이언트 HTML 일치 (FOUC는 인라인 스크립트로 처리)
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('ud-theme') as Theme | null;
    const initial: Theme = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ud-theme', next);
      document.documentElement.setAttribute('data-theme', next);
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
