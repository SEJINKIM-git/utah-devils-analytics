"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import SituationsSubNav from "@/app/components/SituationsSubNav";
import type { ParsedGameNotes, ParsedInning, DetectedSituation } from "@/app/api/parse-game-notes/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type Game = { id: number; date: string; opponent: string; season: string };

type LogStatus = "idle" | "loading" | "done" | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const RESULT_TYPE_KO: Record<string, string> = {
  strikeout: "삼진", walk: "볼넷", hbp: "사구", single: "안타",
  double: "2루타", triple: "3루타", hr: "홈런",
  groundout: "땅볼", flyout: "플라이", forceout: "포스 아웃",
  fielders_choice: "병살/세잎", other: "기타",
};

const RESULT_COLOR: Record<string, string> = {
  strikeout: "#94a3b8", walk: "#60a5fa", hbp: "#f59e0b",
  single: "#22c55e", double: "#16a34a", triple: "#15803d", hr: "#ef4444",
  groundout: "#94a3b8", flyout: "#94a3b8", forceout: "#94a3b8",
  fielders_choice: "#94a3b8", other: "#94a3b8",
};

const LEV_CONFIG = {
  high:   { bg: "rgba(239,68,68,0.12)",  text: "#ef4444", label: "HIGH"  },
  medium: { bg: "rgba(234,179,8,0.12)",  text: "#eab308", label: "MED"   },
  low:    { bg: "rgba(34,197,94,0.10)",  text: "#22c55e", label: "LOW"   },
};

const DECISION_LABEL: Record<string, string> = {
  pitching_change: "투수 교체", steal_attempt: "도루 시도", bunt: "번트",
  hit_and_run: "히트앤런", intentional_walk: "고의사구", defensive_shift: "수비 시프트",
  pinch_hit: "대타", pinch_run: "대주자", infield_in: "내야 전진",
  no_doubles: "노더블 얼라인", other: "기타",
};

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? m[2] : null;
}

function baseLabel(s: number) {
  if (s === 0) return "무주자";
  const p: string[] = [];
  if (s & 1) p.push("1루");
  if (s & 2) p.push("2루");
  if (s & 4) p.push("3루");
  return p.join("·");
}

// ── Inning Card ───────────────────────────────────────────────────────────────

function InningCard({ inn }: { inn: ParsedInning }) {
  const [open, setOpen] = useState(false);
  const half = inn.half === "top" ? "초" : "말";
  const isDefense = inn.half === "top";

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{
          fontSize: 16, fontWeight: 800, color: "var(--text)", minWidth: 60,
        }}>
          {inn.inning}회{half}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
          background: isDefense ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          color: isDefense ? "#ef4444" : "#22c55e",
          border: `1px solid ${isDefense ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`,
        }}>
          {isDefense ? "🛡️ 수비" : "⚔️ 공격"}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>투: {inn.pitcher}</span>
        {inn.stats.runs > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
            {inn.stats.runs}실점
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {inn.stats.pitches}구 · {inn.stats.strikeouts}K · {inn.stats.walks}BB · {inn.stats.hits}H
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {/* Summary bar */}
      <div style={{
        padding: "6px 18px 10px",
        borderTop: "1px solid var(--border)",
        fontSize: 12, color: "var(--text-dim)", fontStyle: "italic",
      }}>
        {inn.summary}
      </div>

      {/* At-bats (expandable) */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 18px 16px" }}>
          {inn.at_bats.map((ab, i) => {
            const resColor = RESULT_COLOR[ab.result_type] ?? "#94a3b8";
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "28px 1fr auto auto",
                gap: 10, alignItems: "start", padding: "8px 0",
                borderBottom: i < inn.at_bats.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                {/* At-bat number */}
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, paddingTop: 2 }}>
                  #{i + 1}
                </span>
                {/* Pitches + notes */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
                  {ab.pitches.map((p, pi) => (
                    <span key={pi} style={{
                      fontSize: 10, padding: "1px 5px", borderRadius: 4,
                      background: p.includes("삼진") || p.includes("아웃") || p.includes("안타") || p.includes("루타") || p.includes("홈런") || p.includes("볼넷") || p.includes("사구")
                        ? resColor + "22" : "var(--border)",
                      color: "var(--text-dim)",
                    }}>
                      {p}
                    </span>
                  ))}
                  {ab.notes && (
                    <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 4 }}>({ab.notes})</span>
                  )}
                </div>
                {/* Base state */}
                <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", paddingTop: 2 }}>
                  {baseLabel(ab.base_state_before)} → {ab.outs_before}아웃
                </span>
                {/* Result */}
                <span style={{
                  fontSize: 11, fontWeight: 700, color: resColor,
                  whiteSpace: "nowrap", paddingTop: 2,
                }}>
                  {RESULT_TYPE_KO[ab.result_type] ?? ab.result}
                  {ab.runs_scored > 0 && (
                    <span style={{ color: "#ef4444", marginLeft: 4 }}>+{ab.runs_scored}점</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Situation Log Button ───────────────────────────────────────────────────────

function SituationLogButton({ sit, gameId, season, onDone }: {
  sit: DetectedSituation;
  gameId: number;
  season: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<LogStatus>("idle");

  async function log() {
    if (!gameId) { alert("경기를 선택해주세요"); return; }
    setStatus("loading");
    try {
      const res = await fetch("/api/situations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id:      gameId,
          season,
          inning:       sit.inning,
          inning_half:  sit.half,
          base_state:   sit.base_state,
          out_count:    sit.out_count,
          score_us:     sit.score_us,
          score_them:   sit.score_them,
          context_note: sit.context_note,
          logged_by:    "game-notes",
        }),
      });
      if (res.ok) { setStatus("done"); onDone(); }
      else        { setStatus("error"); }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") return (
    <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ 기록됨</span>
  );

  return (
    <button
      onClick={log}
      disabled={status === "loading"}
      style={{
        fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
        cursor: status === "loading" ? "wait" : "pointer",
        background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
        border: "1px solid rgba(164,201,255,0.28)",
      }}
    >
      {status === "loading" ? "…" : status === "error" ? "재시도" : "+ 상황 기록"}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GameNotesPage() {
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  const [games,      setGames]      = useState<Game[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [noteText,   setNoteText]   = useState("");
  const [result,     setResult]     = useState<ParsedGameNotes | null>(null);
  const [parsing,    setParsing]    = useState(false);
  const [error,      setError]      = useState("");
  const [loggedIds,  setLoggedIds]  = useState<Set<number>>(new Set());
  const [fileName,   setFileName]   = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setNoteText(text);
      setFileName(file.name);
      setResult(null);
      setError("");
    };
    reader.readAsText(file, "UTF-8");
    // reset so same file can be re-selected
    e.target.value = "";
  }

  const loadGames = useCallback(async () => {
    const res  = await fetch("/api/games");
    const data = await res.json();
    const all: Game[] = Array.isArray(data) ? data : (data.games ?? []);
    const filtered = all.filter(g => g.season === season).reverse();
    setGames(filtered);
    if (filtered.length > 0) setSelectedId(filtered[0].id);
  }, [season]);

  useEffect(() => { loadGames(); }, [loadGames]);

  async function analyze() {
    if (!noteText.trim()) { setError("메모를 입력해주세요"); return; }
    setParsing(true);
    setError("");
    setResult(null);
    try {
      const res  = await fetch("/api/parse-game-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data as ParsedGameNotes);
    } catch {
      setError("분석 요청 실패");
    } finally {
      setParsing(false);
    }
  }

  async function logAll() {
    if (!result) return;
    const toLog = result.detected_situations.filter((_, i) => !loggedIds.has(i));
    for (let i = 0; i < toLog.length; i++) {
      const sit = toLog[i];
      try {
        const res = await fetch("/api/situations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: selectedId, season,
            inning: sit.inning, inning_half: sit.half,
            base_state: sit.base_state, out_count: sit.out_count,
            score_us: sit.score_us, score_them: sit.score_them,
            context_note: sit.context_note, logged_by: "game-notes",
          }),
        });
        if (res.ok) {
          const idx = result.detected_situations.indexOf(sit);
          setLoggedIds(prev => new Set([...prev, idx]));
        }
      } catch { /* continue */ }
    }
  }

  const card: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
    padding: "20px 22px",
  };
  const selectStyle: React.CSSProperties = {
    background: "var(--input-bg, var(--card))", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 13, padding: "8px 12px",
    cursor: "pointer", width: "100%",
  };

  const loggedCount = loggedIds.size;
  const totalSits   = result?.detected_situations.length ?? 0;

  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 대시보드로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>📋 경기 기록 메모 분석</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.18)" }}>
              {season} 시즌
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            직접 작성한 경기 메모를 붙여넣으면 이닝별로 분석하고 고레버리지 상황을 자동 감지합니다
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        <div style={{ display: "grid", gridTemplateColumns: result ? "400px 1fr" : "1fr", gap: 24, alignItems: "start" }}>

          {/* ── Input panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 14 }}>
                경기 선택
              </div>
              <select value={selectedId} onChange={e => setSelectedId(Number(e.target.value))} style={selectStyle}>
                <option value={0}>경기를 선택하세요</option>
                {games.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.date} vs {g.opponent}
                  </option>
                ))}
              </select>
            </div>

            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
                  기록 메모
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                    cursor: "pointer", background: "rgba(164,201,255,0.08)",
                    color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.28)",
                    transition: "all 0.15s",
                  }}
                >
                  📂 파일 업로드
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.text,text/plain"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </div>
              {fileName && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  padding: "6px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)",
                }}>
                  <span style={{ fontSize: 11, color: "#22c55e" }}>✓</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", flex: 1 }}>{fileName}</span>
                  <button onClick={() => { setFileName(""); setNoteText(""); setResult(null); }}
                    style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    ✕
                  </button>
                </div>
              )}
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={"DH 강배현 1번\n1B 이호원 2번\n...\n\n1회초 데빌스 수비\n투: 소이어\n파울\n스트\n볼\n삼진\n..."}
                rows={18}
                style={{
                  width: "100%", fontSize: 12, padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--border)", background: "var(--input-bg, var(--card))",
                  color: "var(--text)", resize: "vertical", fontFamily: "monospace",
                  lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {noteText.length > 0 ? `${noteText.length}자` : "라인업 + 이닝별 피치 메모를 그대로 붙여넣으세요"}
                </span>
                {noteText.length > 0 && (
                  <button onClick={() => { setNoteText(""); setResult(null); }}
                    style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    지우기
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 12 }}>
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={parsing || !noteText.trim()}
              style={{
                padding: "12px 0", borderRadius: 12, cursor: parsing ? "wait" : "pointer",
                fontSize: 14, fontWeight: 800,
                background: parsing || !noteText.trim()
                  ? "var(--border)" : "rgba(164,201,255,0.15)",
                color: parsing || !noteText.trim()
                  ? "var(--text-muted)" : "var(--brand-blue)",
                border: `1px solid ${parsing || !noteText.trim() ? "var(--border)" : "rgba(164,201,255,0.35)"}`,
                transition: "all 0.15s",
              }}
            >
              {parsing ? "🤖 AI 분석 중…" : "🤖 이닝별 분석 시작"}
            </button>
          </div>

          {/* ── Results panel */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Lineup */}
              {result.lineup.length > 0 && (
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 14 }}>
                    라인업 ({result.lineup.length}명)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                    {result.lineup.map((p, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 8, alignItems: "center",
                        padding: "6px 10px", borderRadius: 8, background: "var(--surface-high, rgba(255,255,255,0.03))",
                        border: "1px solid var(--border)",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", minWidth: 14 }}>{p.order}</span>
                        <span style={{ fontSize: 10, color: "var(--brand-blue)", fontWeight: 700, minWidth: 28 }}>{p.position}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                        {p.number && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>#{p.number}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Innings */}
              {result.innings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
                    이닝별 분석 ({result.innings.length}이닝)
                  </div>
                  {result.innings.map((inn, i) => (
                    <InningCard key={i} inn={inn} />
                  ))}
                </div>
              )}

              {/* Detected Situations */}
              {result.detected_situations.length > 0 && (
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
                      감지된 상황 ({result.detected_situations.length}건)
                    </span>
                    {loggedCount > 0 && (
                      <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>
                        {loggedCount}/{totalSits} 기록됨
                      </span>
                    )}
                    {loggedCount < totalSits && selectedId > 0 && (
                      <button
                        onClick={logAll}
                        style={{
                          marginLeft: "auto", fontSize: 11, fontWeight: 700,
                          padding: "5px 14px", borderRadius: 999, cursor: "pointer",
                          background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
                          border: "1px solid rgba(164,201,255,0.28)",
                        }}
                      >
                        전체 기록 ({totalSits - loggedCount}건)
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.detected_situations.map((sit, i) => {
                      const lev = LEV_CONFIG[sit.leverage_hint] ?? LEV_CONFIG.medium;
                      const isLogged = loggedIds.has(i);
                      return (
                        <div key={i} style={{
                          padding: "14px 16px", borderRadius: 12,
                          background: isLogged ? "rgba(34,197,94,0.05)" : "var(--card)",
                          border: `1px solid ${isLogged ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
                          display: "flex", flexDirection: "column", gap: 8,
                        }}>
                          {/* Row 1: badges + inning + base state */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
                              background: lev.bg, color: lev.text, letterSpacing: 0.5 }}>
                              {lev.label}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                              {sit.inning}회 {sit.half === "top" ? "초" : "말"}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                              {baseLabel(sit.base_state)} · {sit.out_count}아웃
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                              {sit.score_us}–{sit.score_them}
                            </span>
                            {sit.pitcher && (
                              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>투: {sit.pitcher}</span>
                            )}
                          </div>

                          {/* Row 2: description */}
                          <p style={{ fontSize: 12, color: "var(--text)", margin: 0, fontWeight: 600 }}>
                            {sit.description}
                          </p>

                          {/* Row 3: context + suggested decision + log button */}
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0, flex: 1, lineHeight: 1.5 }}>
                              {sit.context_note}
                            </p>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                              {sit.suggested_decision_type && (
                                <span style={{
                                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                                  background: "rgba(164,201,255,0.08)", color: "var(--brand-blue)",
                                  border: "1px solid rgba(164,201,255,0.2)",
                                }}>
                                  {DECISION_LABEL[sit.suggested_decision_type] ?? sit.suggested_decision_type}
                                </span>
                              )}
                              {!isLogged && (
                                <SituationLogButton
                                  sit={sit} gameId={selectedId} season={season}
                                  onDone={() => setLoggedIds(prev => new Set([...prev, i]))}
                                />
                              )}
                              {isLogged && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ 기록됨</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hub link */}
                  {loggedCount > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", textAlign: "center" }}>
                      <Link href={`/situations/hub?season=${season}`} style={{
                        fontSize: 13, fontWeight: 700, color: "var(--brand-blue)", textDecoration: "none",
                      }}>
                        🏠 상황 센터 허브에서 확인하기 →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Parse notes */}
              {result.parse_notes && (
                <div style={{ padding: "10px 14px", borderRadius: 10,
                  background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)",
                  fontSize: 11, color: "#eab308" }}>
                  ℹ️ {result.parse_notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
