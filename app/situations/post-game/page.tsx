"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import DecisionCard, { type SituationRow } from "@/app/components/DecisionCard";
import SituationsSubNav from "@/app/components/SituationsSubNav";

// ── Types ─────────────────────────────────────────────────────────────────────

type GameInfo = {
  id: number;
  date: string;
  opponent: string;
  result?: string | null;
  score_us?: number | null;
  score_them?: number | null;
  season: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? m[2] : null;
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ReviewProgress({ rows }: { rows: SituationRow[] }) {
  const withDecision = rows.filter(r => r.decision_id);
  const evaluated = withDecision.filter(r => r.retrospective_eval && r.retrospective_eval !== "pending");
  const correct   = withDecision.filter(r => r.retrospective_eval === "correct").length;
  const incorrect = withDecision.filter(r => r.retrospective_eval === "incorrect").length;
  const total     = withDecision.length;
  const pct       = total > 0 ? Math.round((evaluated.length / total) * 100) : 0;
  const done      = total > 0 && evaluated.length === total;

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
      padding: "16px 20px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: done ? "#22c55e" : "var(--text)" }}>
          {done ? "✓ 리뷰 완료!" : `${evaluated.length} / ${total} 평가 완료`}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", marginBottom: done ? 12 : 0 }}>
        <div style={{
          height: "100%", borderRadius: 3, transition: "width 0.3s ease",
          background: done ? "#22c55e" : "var(--brand-blue)",
          width: `${pct}%`,
        }} />
      </div>
      {done && total > 0 && (
        <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>
            ✓ 정확 {correct}건 ({Math.round((correct / total) * 100)}%)
          </span>
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>
            ✗ 오류 {incorrect}건 ({Math.round((incorrect / total) * 100)}%)
          </span>
          {total - correct - incorrect > 0 && (
            <span style={{ fontSize: 13, color: "#eab308", fontWeight: 700 }}>
              ~ 애매 {total - correct - incorrect}건
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Game List Item ────────────────────────────────────────────────────────────

function GameCard({ g, situCount, decCount, evalCount, active, onClick }: {
  g: GameInfo;
  situCount: number;
  decCount: number;
  evalCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const pending = decCount - evalCount;
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        background: active ? "rgba(164,201,255,0.08)" : "var(--card)",
        border: `1px solid ${active ? "rgba(164,201,255,0.35)" : "var(--border)"}`,
        borderRadius: 12, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 6, transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>
          vs {g.opponent}
        </span>
        {pending > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: "rgba(234,179,8,0.15)", color: "#eab308",
            border: "1px solid rgba(234,179,8,0.3)",
          }}>
            {pending}개 미평가
          </span>
        )}
        {pending === 0 && decCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: "rgba(34,197,94,0.12)", color: "#22c55e",
            border: "1px solid rgba(34,197,94,0.25)",
          }}>
            완료
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        {g.date}
        {g.result && (
          <span style={{
            marginLeft: 8, fontWeight: 700,
            color: g.result === "W" ? "#22c55e" : g.result === "L" ? "#ef4444" : "var(--text-muted)",
          }}>
            {g.result} {g.score_us != null ? `${g.score_us}–${g.score_them}` : ""}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        상황 {situCount}건 · 결정 {decCount}건
      </div>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PostGamePage() {
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  const [games, setGames]           = useState<GameInfo[]>([]);
  const [allRows, setAllRows]       = useState<SituationRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitRes, gameRes] = await Promise.all([
        fetch(`/api/situations?season=${season}&limit=500`),
        fetch(`/api/games`),
      ]);
      const sitData  = await sitRes.json();
      const gameData = await gameRes.json();
      const rows: SituationRow[] = sitData.situations ?? [];
      const allGames: GameInfo[] = Array.isArray(gameData) ? gameData : (gameData.games ?? []);
      const seasonGames = allGames.filter(g => g.season === season);

      setAllRows(rows);
      // Sort games by number of pending decisions (most urgent first)
      const sorted = [...seasonGames].sort((a, b) => {
        const pendingA = rows.filter(r => r.game_id === a.id && r.decision_id &&
          (!r.retrospective_eval || r.retrospective_eval === "pending")).length;
        const pendingB = rows.filter(r => r.game_id === b.id && r.decision_id &&
          (!r.retrospective_eval || r.retrospective_eval === "pending")).length;
        return pendingB - pendingA;
      });
      setGames(sorted);

      // Auto-select first game with pending decisions
      const first = sorted.find(g =>
        rows.some(r => r.game_id === g.id && r.decision_id &&
          (!r.retrospective_eval || r.retrospective_eval === "pending"))
      );
      if (first) setSelectedId(first.id);
      else if (sorted.length > 0) setSelectedId(sorted[0].id);
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => { load(); }, [load]);

  const handleEvalUpdate = (id: string | number, eval_: string) => {
    setAllRows(prev => prev.map(r =>
      r.id === id ? { ...r, retrospective_eval: eval_ as SituationRow["retrospective_eval"] } : r
    ));
  };

  const selectedRows = selectedId
    ? allRows.filter(r => r.game_id === selectedId && r.decision_id)
    : [];

  const selectedGame = games.find(g => g.id === selectedId);

  const gamesWithSituations = games.filter(g => allRows.some(r => r.game_id === g.id && r.decision_id));

  const gameDecStats = (gameId: number) => {
    const rows = allRows.filter(r => r.game_id === gameId);
    const withDec = rows.filter(r => r.decision_id);
    const evaluated = withDec.filter(r => r.retrospective_eval && r.retrospective_eval !== "pending");
    return { situCount: rows.length, decCount: withDec.length, evalCount: evaluated.length };
  };

  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 대시보드로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>📝 포스트게임 리뷰</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.18)" }}>
              {season} 시즌
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            경기별 결정을 복기하고 사후 평가를 기록하세요
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)", fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : gamesWithSituations.length === 0 ? (
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16,
            textAlign: "center", padding: 60,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              리뷰할 결정이 없습니다. 상황 로거에서 결정을 먼저 기록해주세요.
            </p>
            <Link href={`/situations?season=${season}`} style={{
              display: "inline-block", marginTop: 16, padding: "8px 20px", borderRadius: 999,
              background: "rgba(164,201,255,0.12)", color: "var(--brand-blue)",
              border: "1px solid rgba(164,201,255,0.28)", textDecoration: "none", fontSize: 13, fontWeight: 700,
            }}>
              ⚡ 상황 로거로 이동
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>

            {/* ── Left: game list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 80 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4 }}>
                경기 선택 ({gamesWithSituations.length}경기)
              </div>
              {gamesWithSituations.map(g => {
                const { situCount, decCount, evalCount } = gameDecStats(g.id);
                return (
                  <GameCard
                    key={g.id} g={g}
                    situCount={situCount} decCount={decCount} evalCount={evalCount}
                    active={selectedId === g.id}
                    onClick={() => setSelectedId(g.id)}
                  />
                );
              })}
            </div>

            {/* ── Right: decision review */}
            <div>
              {selectedGame && (
                <>
                  {/* Game header */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                      vs {selectedGame.opponent}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
                      {selectedGame.date}
                      {selectedGame.result && (
                        <span style={{
                          marginLeft: 10, fontWeight: 700,
                          color: selectedGame.result === "W" ? "#22c55e" : selectedGame.result === "L" ? "#ef4444" : "var(--text-muted)",
                        }}>
                          {selectedGame.result === "W" ? "승" : selectedGame.result === "L" ? "패" : "무"}{" "}
                          {selectedGame.score_us != null ? `${selectedGame.score_us}–${selectedGame.score_them}` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <ReviewProgress rows={selectedRows} />

                  {/* Decision cards */}
                  {selectedRows.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 40 }}>
                      이 경기에 기록된 결정이 없습니다.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {selectedRows.map(row => (
                        <DecisionCard
                          key={String(row.id)}
                          row={row}
                          noteMode={true}
                          linkToDetail={true}
                          onEvalUpdate={handleEvalUpdate}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .postgame-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
