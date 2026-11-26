"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CommandPalette from "@/app/components/command/CommandPalette";
import MetricSheet, { type MetricSheetRequest } from "@/app/components/metrics/MetricSheet";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import type { Lang } from "@/lib/translations";

type CommandContextValue = {
  lang: Lang;
  /** 지금 보고 있는 시즌 (주소의 ?season= 또는 마지막으로 고른 시즌) */
  season: string | null;
  openPalette: () => void;
  openMetric: (request: MetricSheetRequest) => void;
  /** 현재 위치의 마지막 칸 (선수 이름). 화면이 CrumbLeaf로 알려 준다 */
  crumbLeaf: string | null;
  setCrumbLeaf: (label: string | null) => void;
};

const CommandContext = createContext<CommandContextValue | null>(null);

export function useCommand(): CommandContextValue {
  const value = useContext(CommandContext);
  if (!value) throw new Error("useCommand는 CommandProvider 안에서만 쓸 수 있습니다");
  return value;
}

function readSeasonCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_SEASON_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
};

/**
 * 전역 검색 팔레트와 지표 설명 시트를 모든 화면에 붙인다.
 * 단축키: Ctrl/⌘+K, "/" (글자를 입력하는 중이 아닐 때).
 */
export default function CommandProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [metric, setMetric] = useState<MetricSheetRequest | null>(null);
  const [cookieSeason, setCookieSeason] = useState<string | null>(null);
  const handledParam = useRef<string | null>(null);
  const [crumbLeaf, setCrumbLeaf] = useState<string | null>(null);

  useEffect(() => setCookieSeason(readSeasonCookie()), [pathname, searchParams]);
  const season = searchParams.get("season") || cookieSeason;

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openMetric = useCallback((request: MetricSheetRequest) => {
    setPaletteOpen(false);
    setMetric(request);
  }, []);

  // 단축키
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
      if (!isK && !isSlash) return;
      event.preventDefault();
      setPaletteOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // 주소로 바로 열기: /players/12?metric=OBP → 그 선수의 출루율 설명 시트
  const metricParam = searchParams.get("metric");
  useEffect(() => {
    if (!metricParam) {
      handledParam.current = null;
      return;
    }
    const key = `${pathname}?${metricParam}`;
    if (handledParam.current === key) return;
    handledParam.current = key;
    const playerMatch = pathname.match(/^\/players\/(\d+)/);
    setMetric({
      code: metricParam,
      season: searchParams.get("season") ?? undefined,
      ...(playerMatch ? { playerId: Number(playerMatch[1]) } : {}),
    });
  }, [metricParam, pathname, searchParams]);

  const closeMetric = useCallback(() => {
    setMetric(null);
    if (!metricParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("metric");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [metricParam, pathname, router, searchParams]);

  const value = useMemo(
    () => ({ lang, season, openPalette, openMetric, crumbLeaf, setCrumbLeaf }),
    [lang, season, openPalette, openMetric, crumbLeaf]
  );

  return (
    <CommandContext.Provider value={value}>
      {children}
      <CommandPalette open={paletteOpen} onClose={closePalette} onMetric={openMetric} lang={lang} season={season} />
      <MetricSheet request={metric} onClose={closeMetric} lang={lang} season={season} />
    </CommandContext.Provider>
  );
}
