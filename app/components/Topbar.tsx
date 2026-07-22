"use client";

import { Search } from "lucide-react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import type { Lang } from "@/lib/translations";
import { useSearchParams } from "next/navigation";

export default function Topbar({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const season = searchParams.get("season");

  return (
    <header className="layout-topbar">
      <div className="topbar-search">
        <Search size={14} strokeWidth={1.8} className="topbar-search-icon" />
        <input
          type="text"
          placeholder={lang === "ko" ? "선수 또는 기록 검색…" : "Search players or stats…"}
          className="topbar-search-input"
          readOnly
          tabIndex={-1}
        />
      </div>
      <div className="topbar-right">
        {season && (
          <span className="topbar-season-badge">{season}</span>
        )}
        <ThemeToggle lang={lang} />
      </div>
    </header>
  );
}
