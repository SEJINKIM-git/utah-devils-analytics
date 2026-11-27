"use client";

import { Search } from "lucide-react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import LangToggle from "@/app/components/LangToggle";
import type { Lang } from "@/lib/translations";
import { useSearchParams } from "next/navigation";
import { useCommand } from "@/app/components/command/CommandProvider";

export default function Topbar({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const { openPalette } = useCommand();
  const season = searchParams.get("season");
  const term = searchParams.get("term");

  return (
    <header className="layout-topbar">
      <button
        type="button"
        className="topbar-search"
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        data-testid="open-search"
      >
        <Search size={14} strokeWidth={1.8} className="topbar-search-icon" aria-hidden="true" />
        <span className="topbar-search-text">
          {lang === "ko" ? "선수 이름이나 궁금한 걸 입력하세요" : "Type a player's name or a question"}
        </span>
        <kbd className="topbar-search-kbd" aria-hidden="true">⌘K</kbd>
      </button>
      <div className="topbar-right">
        {season && (
          <span className="topbar-season-badge">{term ? `${season} · ${term}` : season}</span>
        )}
        <LangToggle lang={lang} />
        <ThemeToggle lang={lang} />
      </div>
    </header>
  );
}
