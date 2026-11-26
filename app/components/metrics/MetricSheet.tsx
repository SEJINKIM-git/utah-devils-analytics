"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { useModal } from "@/app/components/command/useModal";
import { getMetric, type MetricDef } from "@/lib/metrics";
import { getPlayerDisplayName } from "@/lib/playerDisplay";
import type { Lang } from "@/lib/translations";

export type MetricSheetRequest = {
  code: string;
  /** 없으면 팀 기준 */
  playerId?: number;
  season?: string;
  /** 눌렀던 화면에 보이던 값. 있으면 그대로 보여 준다 */
  value?: string;
};

type Entry = {
  rank: number | null;
  display: string;
  qualified: boolean;
  player: { id: number; number: number | null; name: string };
  totals: { pa?: number; innings?: number } | null;
};

type RankData = {
  entries: Entry[];
  team: { display: string };
  me: Entry | null;
  minPa: number;
  minIp: number;
  games: number;
};

type HistoryItem = { key: string; date: string | null; opponent: string | null; display: string };

const TEXT = {
  ko: {
    close: "설명 닫기",
    player: "이 선수",
    team: "팀 전체",
    rankLabel: "팀 안 순위",
    rankOf: (rank: number, total: number) => `${total}명 중 ${rank}위`,
    noRecord: "기록 없음",
    below: "규정 미달",
    belowPa: (min: number, now: number) => `규정 타석 ${min}타석에 못 미쳐 순위에서 빠졌어요 (지금 ${now}타석).`,
    belowIp: (min: number, now: string) => `규정 이닝 ${min}이닝에 못 미쳐 순위에서 빠졌어요 (지금 ${now}이닝).`,
    rule: (games: number, min: number, unit: string) => `규정: 기록이 있는 ${games}경기 기준 ${min}${unit} 이상`,
    noRule: "이 시즌은 경기별 기록이 없어 규정 기준 없이 모두 순위에 넣었어요.",
    how: "계산법",
    note: "알아 둘 점",
    showRank: "팀 순위 보기",
    showGames: "경기별로 보기",
    noGames: "이 시즌은 경기별 기록이 없어요.",
    allRecords: "전체 기록표 보기",
    loading: "불러오는 중…",
    failed: "팀 기록을 불러오지 못했어요. 설명은 아래에서 볼 수 있어요.",
    unknown: "지표 사전에 없는 코드예요.",
    better: { true: "높을수록 좋아요", false: "낮을수록 좋아요" },
    season: (s: string) => (s === "Career" ? "통산" : `${s} 시즌`),
    pa: "타석",
    ip: "이닝",
    vs: "상대",
  },
  en: {
    close: "Close",
    player: "This player",
    team: "Team",
    rankLabel: "Team rank",
    rankOf: (rank: number, total: number) => `#${rank} of ${total}`,
    noRecord: "No record",
    below: "Not qualified",
    belowPa: (min: number, now: number) => `Below the ${min} plate appearances needed to be ranked (now ${now}).`,
    belowIp: (min: number, now: string) => `Below the ${min} innings needed to be ranked (now ${now}).`,
    rule: (games: number, min: number, unit: string) => `Qualifier: ${min}+ ${unit} over ${games} recorded games`,
    noRule: "No per-game records this season, so everyone is ranked.",
    how: "How it is calculated",
    note: "Good to know",
    showRank: "Show team ranking",
    showGames: "Show game by game",
    noGames: "No per-game records for this season.",
    allRecords: "Open full records table",
    loading: "Loading…",
    failed: "Could not load team records. The explanation is below.",
    unknown: "This code is not in the stat dictionary.",
    better: { true: "Higher is better", false: "Lower is better" },
    season: (s: string) => (s === "Career" ? "Career" : `${s} season`),
    pa: "PA",
    ip: "IP",
    vs: "vs",
  },
} as const;

/**
 * 지표 설명 시트 (블룸버그의 정보 패널).
 * 휴대폰에서는 아래에서 올라오고, PC에서는 오른쪽 옆 패널로 뜬다.
 * 내용은 모두 지표 사전(registry.json)과 조회 함수(GET /api/metrics)에서 온다.
 */
export default function MetricSheet({
  request,
  onClose,
  lang,
  season: currentSeason,
}: {
  request: MetricSheetRequest | null;
  onClose: () => void;
  lang: Lang;
  season: string | null;
}) {
  const text = TEXT[lang];
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [rank, setRank] = useState<RankData | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRank, setOpenRank] = useState(false);
  const [games, setGames] = useState<HistoryItem[] | null>(null);
  const [openGames, setOpenGames] = useState(false);

  const open = request !== null;
  const metric: MetricDef | null = request ? getMetric(request.code) : null;
  useModal(panelRef, open, onClose);

  // 열릴 때마다 초기화하고 시즌을 정한다 (요청 → 지금 보는 시즌 → 서버가 아는 최신 시즌)
  useEffect(() => {
    if (!request) return;
    setRank(null);
    setFailed(false);
    setOpenRank(false);
    setGames(null);
    setOpenGames(false);
    closeRef.current?.focus();

    const known = request.season ?? currentSeason;
    if (known) {
      setSeason(known);
      return;
    }
    let alive = true;
    setSeason(null);
    fetch("/api/seasons", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { preferredSeason?: string; latestSeason?: string }) => alive && setSeason(data.preferredSeason || data.latestSeason || "2025"))
      .catch(() => alive && setSeason("2025"));
    return () => {
      alive = false;
    };
  }, [request, currentSeason]);

  const target = request?.playerId ? `player:${request.playerId}` : "team";

  useEffect(() => {
    if (!request || !metric || !season) return;
    let alive = true;
    const params = new URLSearchParams({ mode: "rank", code: metric.code, season, qualify: "1", target });
    fetch(`/api/metrics?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: RankData) => alive && setRank(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [request, metric, season, target]);

  const loadGames = () => {
    const next = !openGames;
    setOpenGames(next);
    if (!next || games !== null || !metric || !season) return;
    const params = new URLSearchParams({ mode: "history", code: metric.code, by: "game", target });
    if (season !== "Career") {
      params.set("from", season);
      params.set("to", season);
    }
    fetch(`/api/metrics?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items?: HistoryItem[] }) => setGames((data.items ?? []).slice(-12).reverse()))
      .catch(() => setGames([]));
  };

  if (!request) return null;

  const name = metric ? (lang === "ko" ? metric.nameKo : metric.nameEn) : request.code;
  const me = rank?.me ?? null;
  const ranked = rank ? rank.entries.filter((entry) => entry.rank !== null) : [];
  const isBatting = metric?.kind === "batting";
  const minimum = rank ? (isBatting ? rank.minPa : rank.minIp) : 0;
  const unit = isBatting ? text.pa : text.ip;
  const playerName = me ? getPlayerDisplayName(me.player.name, lang) : null;
  const withSeason = (href: string) => (season ? `${href}?season=${encodeURIComponent(season)}` : href);

  const playerValue = request.value ?? me?.display ?? (rank ? "---" : "…");
  const rankValue = !rank ? "…" : !me ? text.noRecord : me.rank === null ? text.below : text.rankOf(me.rank, ranked.length);

  return (
    <div className="msheet-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className="msheet" role="dialog" aria-modal="true" aria-labelledby="msheet-title">
        <div className="msheet-grip" aria-hidden="true" />
        <div className="msheet-head">
          <div>
            <div className="msheet-eyebrow">
              <span className="msheet-code">{metric?.code ?? request.code}</span>
              {season && <span>{text.season(season)}</span>}
              {playerName && <span>{playerName}</span>}
            </div>
            <h2 id="msheet-title" className="msheet-title">
              {name}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="msheet-close" onClick={onClose} aria-label={text.close}>
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        {!metric ? (
          <p className="msheet-summary">{text.unknown}</p>
        ) : (
          <div className="msheet-body">
            <p className="msheet-summary">
              {lang === "ko" ? metric.summaryKo : metric.summaryEn}
              {metric.higherIsBetter !== null && (
                <span className="msheet-better"> · {text.better[String(metric.higherIsBetter) as "true" | "false"]}</span>
              )}
            </p>

            {/* 숫자는 세 개까지만 */}
            <div className="msheet-numbers">
              {request.playerId !== undefined && (
                <div className="msheet-number primary">
                  <div className="msheet-number-label">{text.player}</div>
                  <div className="msheet-number-value num" data-testid="msheet-player-value">{playerValue}</div>
                </div>
              )}
              <div className={request.playerId === undefined ? "msheet-number primary" : "msheet-number"}>
                <div className="msheet-number-label">{text.team}</div>
                <div className="msheet-number-value num" data-testid="msheet-team-value">
                  {request.playerId === undefined && request.value ? request.value : rank ? rank.team.display : failed ? "---" : "…"}
                </div>
              </div>
              {request.playerId !== undefined && (
                <div className="msheet-number">
                  <div className="msheet-number-label">{text.rankLabel}</div>
                  <div className="msheet-number-value small" data-testid="msheet-rank">{failed ? "---" : rankValue}</div>
                </div>
              )}
            </div>

            {failed && <p className="msheet-note" role="status">{text.failed}</p>}
            {rank && me && me.rank === null && !me.qualified && (
              <p className="msheet-note" role="status">
                {isBatting
                  ? text.belowPa(rank.minPa, Number(me.totals?.pa ?? 0))
                  : text.belowIp(rank.minIp, (Math.round(Number(me.totals?.innings ?? 0) * 10) / 10).toString())}
              </p>
            )}

            <section className="msheet-section" aria-labelledby="msheet-how">
              <h3 id="msheet-how" className="msheet-section-title">{text.how}</h3>
              <p className="msheet-formula">{lang === "ko" ? metric.formulaKo : metric.formulaEn}</p>
              {(lang === "ko" ? metric.noteKo : metric.noteEn) && (
                <p className="msheet-note">
                  <strong>{text.note}</strong> · {lang === "ko" ? metric.noteKo : metric.noteEn}
                </p>
              )}
            </section>

            {/* 표는 눌렀을 때 펼친다 */}
            <section className="msheet-section">
              <button type="button" className="msheet-toggle" aria-expanded={openRank} aria-controls="msheet-rank-list" onClick={() => setOpenRank((value) => !value)}>
                {text.showRank}
                <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" className={openRank ? "msheet-chevron open" : "msheet-chevron"} />
              </button>
              {openRank && (
                <div id="msheet-rank-list">
                  {!rank ? (
                    <p className="msheet-note">{failed ? text.failed : text.loading}</p>
                  ) : (
                    <>
                      <ol className="msheet-list">
                        {rank.entries.map((entry) => (
                          <li key={entry.player.id} className={me && entry.player.id === me.player.id ? "msheet-row me" : "msheet-row"}>
                            <span className="msheet-row-rank num">{entry.rank ?? "–"}</span>
                            <Link href={withSeason(`/players/${entry.player.id}`)} className="msheet-row-name" onClick={onClose}>
                              {getPlayerDisplayName(entry.player.name, lang)}
                            </Link>
                            <span className="msheet-row-value num">{entry.display}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="msheet-note">{rank.games > 0 ? text.rule(rank.games, minimum, unit) : text.noRule}</p>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="msheet-section">
              <button type="button" className="msheet-toggle" aria-expanded={openGames} aria-controls="msheet-game-list" onClick={loadGames}>
                {text.showGames}
                <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" className={openGames ? "msheet-chevron open" : "msheet-chevron"} />
              </button>
              {openGames && (
                <div id="msheet-game-list">
                  {games === null ? (
                    <p className="msheet-note">{text.loading}</p>
                  ) : games.length === 0 ? (
                    <p className="msheet-note">{text.noGames}</p>
                  ) : (
                    <ul className="msheet-list">
                      {games.map((game) => (
                        <li key={game.key} className="msheet-row">
                          <span className="msheet-row-date num">{game.date ?? "–"}</span>
                          <span className="msheet-row-name">{game.opponent ? `${text.vs} ${game.opponent}` : ""}</span>
                          <span className="msheet-row-value num">{game.display}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <Link href={withSeason("/records")} className="msheet-link" onClick={onClose}>
              {text.allRecords}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
