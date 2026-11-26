"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useModal } from "@/app/components/command/useModal";
import type { MetricSheetRequest } from "@/app/components/metrics/MetricSheet";
import {
  buildCommandGroups,
  parseCommand,
  type CommandAction,
  type CommandGroup,
  type CommandItem,
  type CommandPlayer,
} from "@/lib/command/parse";
import type { Lang } from "@/lib/translations";

type IndexPlayer = CommandPlayer & { nameEn?: string };

const RECENT_KEY = "ud-recent-v1";
const MAX_RECENT = 5;

const TEXT = {
  ko: {
    label: "검색",
    placeholder: "선수 이름이나 궁금한 걸 입력하세요",
    close: "검색 닫기",
    groups: { metric: "지표", player: "선수", screen: "화면", ask: "AI에게 물어보기" },
    examples: "이렇게 물어보세요",
    recent: "최근 본 항목",
    results: (n: number) => `결과 ${n}개`,
    hint: "↑↓ 이동 · Enter 선택 · Esc 닫기",
    loading: "선수 목록을 불러오는 중…",
  },
  en: {
    label: "Search",
    placeholder: "Type a player's name or a question",
    close: "Close search",
    groups: { metric: "Stats", player: "Players", screen: "Screens", ask: "Ask AI" },
    examples: "Try asking",
    recent: "Recently viewed",
    results: (n: number) => `${n} results`,
    hint: "↑↓ move · Enter select · Esc close",
    loading: "Loading players…",
  },
} as const;

function readRecent(): CommandItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.title && item.action).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(item: CommandItem) {
  if (item.group === "ask") return; // 질문 문장은 남기지 않는다
  try {
    const next = [item, ...readRecent().filter((entry) => entry.id !== item.id)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 최근 항목 없이 동작한다
  }
}

export default function CommandPalette({
  open,
  onClose,
  onMetric,
  lang,
  season,
}: {
  open: boolean;
  onClose: () => void;
  onMetric: (request: MetricSheetRequest) => void;
  lang: Lang;
  season: string | null;
}) {
  const router = useRouter();
  const text = TEXT[lang];
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [players, setPlayers] = useState<IndexPlayer[] | null>(null);
  const [recent, setRecent] = useState<CommandItem[]>([]);

  useModal(panelRef, open, onClose);

  // 열릴 때: 입력창 포커스, 최근 항목 읽기, 선수 목록은 처음 한 번만 불러온다
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setRecent(readRecent());
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || players !== null) return;
    let alive = true;
    fetch("/api/search-index", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { players?: IndexPlayer[] }) => alive && setPlayers(data.players ?? []))
      .catch(() => alive && setPlayers([]));
    return () => {
      alive = false;
    };
  }, [open, players]);

  const displayName = useCallback(
    (player: CommandPlayer) => (lang === "en" ? (player as IndexPlayer).nameEn || player.name : player.name),
    [lang]
  );

  const groups: CommandGroup[] = useMemo(() => {
    if (query.trim()) {
      return buildCommandGroups(parseCommand(query, { players: players ?? [] }), { lang, season, displayName });
    }
    return recent.length > 0 ? [{ group: "screen", items: recent }] : [];
  }, [query, players, lang, season, displayName, recent]);

  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const showingRecent = !query.trim();
  const activeItem = items[Math.min(active, items.length - 1)];
  const optionId = (item: CommandItem) => `cmdk-option-${item.id}`;

  useEffect(() => setActive(0), [query]);

  // 키보드로 옮긴 항목이 보이도록
  useEffect(() => {
    if (!activeItem) return;
    listRef.current?.querySelector(`#${CSS.escape(optionId(activeItem))}`)?.scrollIntoView({ block: "nearest" });
  }, [activeItem]);

  const run = useCallback(
    (item: CommandItem) => {
      writeRecent(item);
      const action: CommandAction = item.action;
      onClose();
      if (action.type === "metric") {
        onMetric({ code: action.code, season: action.season ?? season ?? undefined, playerId: action.playerId });
      } else {
        router.push(action.href);
      }
    },
    [onClose, onMetric, router, season]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return; // 한글 조합 중에는 Enter·화살표를 가로채지 않는다
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length) setActive((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length) setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Home" && items.length) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && items.length) {
      event.preventDefault();
      setActive(items.length - 1);
    } else if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      run(activeItem);
    }
  };

  if (!open) return null;

  // 예시 칩: 지표 하나, 팀 + 지표, 선수 + 지표(선수 목록이 있으면 첫 선수)
  const firstPlayer = players?.[0];
  const examples =
    lang === "ko"
      ? ["출루율", "팀 ERA", firstPlayer ? `${displayName(firstPlayer)} OPS` : "순위"]
      : ["OBP", "team ERA", firstPlayer ? `${displayName(firstPlayer)} OPS` : "rankings"];

  let flatIndex = -1;

  return (
    <div className="cmdk-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className="cmdk" role="dialog" aria-modal="true" aria-label={text.label}>
        <div className="cmdk-input-row">
          <Search size={18} strokeWidth={1.8} aria-hidden="true" className="cmdk-input-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            role="combobox"
            aria-label={text.label}
            aria-expanded={items.length > 0}
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={text.placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="cmdk-close" onClick={onClose} aria-label={text.close}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="sr-only" aria-live="polite">
          {query.trim() ? text.results(items.length) : ""}
        </div>

        {showingRecent && (
          <div className="cmdk-examples">
            <div className="cmdk-group-label">{text.examples}</div>
            <div className="cmdk-chips">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="cmdk-chip"
                  onClick={() => {
                    setQuery(example);
                    inputRef.current?.focus();
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={listRef} id="cmdk-listbox" className="cmdk-list" role="listbox" aria-label={showingRecent ? text.recent : text.label}>
          {groups.map((group, groupIndex) => {
            const labelId = `cmdk-group-${groupIndex}`;
            return (
              <div key={`${group.group}-${groupIndex}`} role="group" aria-labelledby={labelId} className="cmdk-group">
                <div id={labelId} className="cmdk-group-label">
                  {showingRecent ? text.recent : text.groups[group.group]}
                </div>
                {group.items.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const selected = activeItem === item;
                  return (
                    <div
                      key={item.id}
                      id={optionId(item)}
                      role="option"
                      aria-selected={selected}
                      className={selected ? "cmdk-item active" : "cmdk-item"}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(item)}
                    >
                      <div className="cmdk-item-text">
                        <div className="cmdk-item-title">{item.title}</div>
                        <div className="cmdk-item-sub">{item.subtitle}</div>
                      </div>
                      {item.badge && <span className="cmdk-badge">{item.badge}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {query.trim() && players === null && <div className="cmdk-note">{text.loading}</div>}
        </div>

        <div className="cmdk-foot" aria-hidden="true">
          {text.hint}
        </div>
      </div>
    </div>
  );
}
