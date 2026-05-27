"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import DecisionCard, { type SituationRow } from "@/app/components/DecisionCard";
import SituationsSubNav from "@/app/components/SituationsSubNav";

// ── Constants ─────────────────────────────────────────────────────────────────

const DECISION_LABEL: Record<string, string> = {
  pitching_change:  "투수 교체",
  steal_attempt:    "도루 시도",
  bunt:             "번트",
  hit_and_run:      "히트앤런",
  intentional_walk: "고의사구",
  defensive_shift:  "수비 시프트",
  pinch_hit:        "대타",
  pinch_run:        "대주자",
  infield_in:       "내야 전진",
  no_doubles:       "노더블 얼라인",
  other:            "기타",
};

const LEV_COLOR = {
  high:   { bg: "rgba(239,68,68,0.13)",  text: "#ef4444", bar: "#ef4444",  label: "HIGH" },
  medium: { bg: "rgba(234,179,8,0.13)",  text: "#eab308", bar: "#eab308",  label: "MED"  },
  low:    { bg: "rgba(34,197,94,0.10)",  text: "#22c55e", bar: "#22c55e",  label: "LOW"  },
};

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? m[2] : null;
}

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

type TypeStat = {
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
};

type GameStat = {
  game_id: number;
  total: number;
  high: number;
  decisions: number;
  correct: number;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
      padding: "14px 20px", display: "flex", flexDirection: "column", gap: 3, minWidth: 110, flex: 1,
    }}>
      <span style={{ fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

function LeverageBar({ lc, count, total }: { lc: "high" | "medium" | "low"; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const c = LEV_COLOR[lc];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{c.label}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
          {count}건 ({pct.toFixed(0)}%)
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: c.bar,
          width: `${pct}%`, transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function DecisionTypeRow({ type, stat }: { type: string; stat: TypeStat }) {
  const acc = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null;
  const accColor = acc === null ? "var(--text-muted)"
    : acc >= 70 ? "#22c55e" : acc >= 50 ? "#eab308" : "#ef4444";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 44px 44px 44px 52px",
      gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)",
      alignItems: "center",
    }}>
      <span style={{ fontSize: 12, color: "var(--text)" }}>{DECISION_LABEL[type] ?? type}</span>
      <span style={{ fontSize: 12, color: "#22c55e",         textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stat.correct}</span>
      <span style={{ fontSize: 12, color: "#ef4444",         textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stat.incorrect}</span>
      <span style={{ fontSize: 12, color: "#94a3b8",         textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stat.pending}</span>
      <span style={{ fontSize: 12, color: accColor, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {acc !== null ? `${acc}%` : "—"}
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SituationHubPage() {
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  const [rows, setRows]         = useState<SituationRow[]>([]);
  const [games, setGames]       = useState<GameInfo[]>([]);
  const [loading, setLoading]   = useState(true);

  // filters
  const [levFilter,    setLevFilter]    = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [evalFilter,   setEvalFilter]   = useState("");
  const [gameFilter,   setGameFilter]   = useState("");
  const [showList,     setShowList]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitRes, gameRes] = await Promise.all([
        fetch(`/api/situations?season=${season}&limit=500`),
        fetch(`/api/games?season=${season}`),
      ]);
      const sitData  = await sitRes.json();
      const gameData = await gameRes.json();
      setRows(sitData.situations ?? []);
      setGames(Array.isArray(gameData) ? gameData : (gameData.games ?? []));
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => { load(); }, [load]);

  const handleEvalUpdate = (id: string | number, eval_: string) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, retrospective_eval: eval_ as SituationRow["retrospective_eval"] } : r
    ));
  };

  // ── Computed stats ─────────────────────────────────────────────────────────

  const gameMap = new Map<number, GameInfo>(games.map(g => [g.id, g]));

  const total         = rows.length;
  const highLI        = rows.filter(r => r.leverage_class === "high").length;
  const medLI         = rows.filter(r => r.leverage_class === "medium").length;
  const lowLI         = rows.filter(r => r.leverage_class === "low").length;
  const withDecision  = rows.filter(r => r.decision_type);
  const correct       = withDecision.filter(r => r.retrospective_eval === "correct").length;
  const incorrect     = withDecision.filter(r => r.retrospective_eval === "incorrect").length;
  const pending       = withDecision.filter(r => !r.retrospective_eval || r.retrospective_eval === "pending").length;
  const accuracy      = withDecision.length > 0 ? Math.round((correct / withDecision.length) * 100) : null;

  // Decision type breakdown
  const typeStats = new Map<string, TypeStat>();
  for (const r of withDecision) {
    const t = r.decision_type!;
    const s = typeStats.get(t) ?? { total: 0, correct: 0, incorrect: 0, pending: 0 };
    s.total++;
    if (r.retrospective_eval === "correct")   s.correct++;
    else if (r.retrospective_eval === "incorrect") s.incorrect++;
    else s.pending++;
    typeStats.set(t, s);
  }
  const typeRows = [...typeStats.entries()].sort((a, b) => b[1].total - a[1].total);

  // Per-game breakdown
  const gameStats = new Map<number, GameStat>();
  for (const r of rows) {
    const g = r.game_id;
    const s = gameStats.get(g) ?? { game_id: g, total: 0, high: 0, decisions: 0, correct: 0 };
    s.total++;
    if (r.leverage_class === "high") s.high++;
    if (r.decision_type) { s.decisions++; if (r.retrospective_eval === "correct") s.correct++; }
    gameStats.set(g, s);
  }
  const gameRows = [...gameStats.values()].sort((a, b) => b.total - a.total);

  // Filtered list
  const filteredList = rows.filter(r => {
    if (levFilter  && r.leverage_class !== levFilter)  return false;
    if (typeFilter && r.decision_type  !== typeFilter)  return false;
    if (gameFilter && String(r.game_id) !== gameFilter) return false;
    if (evalFilter) {
      if (evalFilter === "no_decision") return !r.decision_type;
      if (evalFilter === "pending") return r.decision_type && (!r.retrospective_eval || r.retrospective_eval === "pending");
      if (r.retrospective_eval !== evalFilter) return false;
    }
    return true;
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 14, padding: "20px 22px",
  };
  const selectStyle: React.CSSProperties = {
    background: "var(--input-bg, var(--card))", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 13, padding: "6px 10px", cursor: "pointer",
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 대시보드로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>🏠 상황 센터 허브</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.18)" }}>
              {season} 시즌
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            전체 상황 통계 · 레버리지 분포 · 결정 유형 분석 · 경기별 브레이크다운
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)", fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : total === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              아직 기록된 상황이 없습니다. 로거에서 상황을 기록해보세요.
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
          <>
            {/* ── 1. Stats row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              <StatChip label="총 상황"      value={total}              color="var(--text)" />
              <StatChip label="HIGH LI"      value={highLI}             color="#ef4444"
                sub={`${total > 0 ? Math.round((highLI / total) * 100) : 0}% of total`} />
              <StatChip label="결정 기록"    value={withDecision.length} color="var(--brand-blue)" />
              <StatChip label="정확도"
                value={accuracy !== null ? `${accuracy}%` : "—"}
                color={accuracy === null ? "var(--text-muted)" : accuracy >= 70 ? "#22c55e" : accuracy >= 50 ? "#eab308" : "#ef4444"}
                sub={accuracy !== null ? `${correct}정확 / ${incorrect}오류 / ${pending}미평가` : "평가 없음"} />
            </div>

            {/* ── 2. Distribution + Decision type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Leverage distribution */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 16 }}>
                  레버리지 분포
                </div>
                <LeverageBar lc="high"   count={highLI} total={total} />
                <LeverageBar lc="medium" count={medLI}  total={total} />
                <LeverageBar lc="low"    count={lowLI}  total={total} />
              </div>

              {/* Decision type breakdown */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 8 }}>
                  결정 유형별 분석
                </div>
                {typeRows.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>결정 기록 없음</p>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 44px 44px 52px",
                      gap: 8, padding: "4px 0 6px", borderBottom: "2px solid var(--border)" }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>유형</span>
                      <span style={{ fontSize: 10, color: "#22c55e", textAlign: "right", fontWeight: 700 }}>정확</span>
                      <span style={{ fontSize: 10, color: "#ef4444", textAlign: "right", fontWeight: 700 }}>오류</span>
                      <span style={{ fontSize: 10, color: "#94a3b8", textAlign: "right", fontWeight: 700 }}>미평</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", fontWeight: 700 }}>정확도</span>
                    </div>
                    {typeRows.map(([type, stat]) => (
                      <DecisionTypeRow key={type} type={type} stat={stat} />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── 3. Per-game breakdown */}
            {gameRows.length > 0 && (
              <div style={{ ...card, marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 14 }}>
                  경기별 브레이크다운
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)" }}>
                        {["날짜", "상대", "결과", "총 상황", "HIGH LI", "결정", "정확"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: h === "날짜" || h === "상대" || h === "결과" ? "left" : "right",
                            fontSize: 11, color: "var(--text-muted)", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gameRows.map(gs => {
                        const g = gameMap.get(gs.game_id);
                        const acc = gs.decisions > 0 ? Math.round((gs.correct / gs.decisions) * 100) : null;
                        return (
                          <tr key={gs.game_id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 10px", color: "var(--text-dim)", fontSize: 12 }}>
                              {g?.date ?? "—"}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--text)", fontWeight: 600 }}>
                              {g?.opponent ?? `경기 #${gs.game_id}`}
                            </td>
                            <td style={{ padding: "8px 10px",
                              color: g?.result === "W" ? "#22c55e" : g?.result === "L" ? "#ef4444" : "var(--text-muted)",
                              fontWeight: 700, fontSize: 12 }}>
                              {g?.result ?? "—"}{g?.score_us != null ? ` ${g.score_us}–${g.score_them}` : ""}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{gs.total}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{gs.high}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{gs.decisions}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right",
                              color: acc === null ? "var(--text-muted)" : acc >= 70 ? "#22c55e" : acc >= 50 ? "#eab308" : "#ef4444",
                              fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                              {acc !== null ? `${acc}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── 4. Filtered list */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
                  전체 상황 목록 ({filteredList.length}건)
                </span>
                <button
                  onClick={() => setShowList(v => !v)}
                  style={{
                    background: "none", border: "1px solid var(--border)", borderRadius: 8,
                    padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "var(--text-dim)",
                  }}
                >
                  {showList ? "접기" : "펼치기"}
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: showList ? 16 : 0 }}>
                <select value={levFilter}  onChange={e => setLevFilter(e.target.value)}  style={selectStyle}>
                  <option value="">전체 레버리지</option>
                  <option value="high">HIGH</option>
                  <option value="medium">MED</option>
                  <option value="low">LOW</option>
                </select>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
                  <option value="">전체 결정 유형</option>
                  {Object.entries(DECISION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={evalFilter} onChange={e => setEvalFilter(e.target.value)} style={selectStyle}>
                  <option value="">전체 평가</option>
                  <option value="correct">✓ 정확</option>
                  <option value="incorrect">✗ 오류</option>
                  <option value="ambiguous">~ 애매</option>
                  <option value="pending">? 미평가</option>
                  <option value="no_decision">결정 없음</option>
                </select>
                <select value={gameFilter} onChange={e => setGameFilter(e.target.value)} style={selectStyle}>
                  <option value="">전체 경기</option>
                  {gameRows.map(gs => {
                    const g = gameMap.get(gs.game_id);
                    return (
                      <option key={gs.game_id} value={String(gs.game_id)}>
                        {g ? `${g.date} vs ${g.opponent}` : `경기 #${gs.game_id}`}
                      </option>
                    );
                  })}
                </select>
                {(levFilter || typeFilter || evalFilter || gameFilter) && (
                  <button onClick={() => { setLevFilter(""); setTypeFilter(""); setEvalFilter(""); setGameFilter(""); }}
                    style={{ ...selectStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}>
                    ✕ 초기화
                  </button>
                )}
              </div>

              {showList && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {filteredList.length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>
                      조건에 맞는 상황이 없습니다.
                    </p>
                  ) : (
                    filteredList.map(row => (
                      <DecisionCard key={String(row.id)} row={row} onEvalUpdate={handleEvalUpdate} linkToDetail={true} />
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hub-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
