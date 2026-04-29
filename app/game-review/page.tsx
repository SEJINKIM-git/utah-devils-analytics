"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import { extractGameMetaFromFilename } from "@/lib/gameFileMeta";
import {
  localizeBattingRows,
  localizeObjectNameFields,
  localizePitchingRows,
} from "@/lib/playerDisplay";
import {
  sanitizeGameReviewContent,
  sanitizeOpponentName,
} from "@/lib/gameReviewSanitizer";
import { formatRateStat } from "@/lib/statFormatting";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function GameReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<"ko" | "en">("ko");
  const [file, setFile] = useState<File | null>(null);
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [season, setSeason] = useState(searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2025");
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [battingData, setBattingData] = useState<any[]>([]);
  const [pitchingData, setPitchingData] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [pastGames, setPastGames] = useState<any[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [viewingPast, setViewingPast] = useState(false);
  const [viewingGameId, setViewingGameId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const syncLangFromCookie = () => setLang(getCookie("lang") === "en" ? "en" : "ko");

  const extractFromFilename = (filename: string) => {
    const meta = extractGameMetaFromFilename(filename, season);
    if (!opponent && meta.opponent) setOpponent(sanitizeOpponentName(meta.opponent));
    if (!gameDate && meta.date) setGameDate(meta.date);
  };

  useEffect(() => {
    syncLangFromCookie();
    const handleLangChange = () => syncLangFromCookie();
    window.addEventListener("ud:lang-change", handleLangChange);
    return () => window.removeEventListener("ud:lang-change", handleLangChange);
  }, []);

  useEffect(() => {
    const nextSeason = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2025";
    setSeason(nextSeason);
  }, [searchParams]);

  useEffect(() => {
    fetchPastGames(season);
  }, [season]);

  const fetchPastGames = async (targetSeason: string) => {
    try {
      const res = await fetch(`/api/game-review?season=${encodeURIComponent(targetSeason)}`, { cache: "no-store" });
      const data = await res.json();
      setPastGames(data.records || []);
    } catch (e) { console.error(e); }
  };

  const applyRecord = (game: any) => {
    if (!game) return;
    setReview(game.ai_review || null);
    setBattingData(game.batting_data || []);
    setPitchingData(game.pitching_data || []);
    setOpponent(sanitizeOpponentName(game.opponent || ""));
    setGameDate(game.game_date || "");
    setViewingGameId(game.id || null);
    if (game.season) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("season", game.season);
      router.replace(`/game-review?${params.toString()}`);
      setSeason(game.season);
    }
  };

  const fetchGameDetail = async (gameId: number, targetLang: "ko" | "en") => {
    const res = await fetch(`/api/game-review?id=${gameId}&lang=${targetLang}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    return data.record;
  };

  useEffect(() => {
    if (!viewingGameId || !review) return;

    let cancelled = false;
    const refreshViewedGame = async () => {
      try {
        const detailed = await fetchGameDetail(viewingGameId, lang);
        if (!cancelled) applyRecord(detailed);
      } catch (e) {
        console.error(e);
      }
    };

    refreshViewedGame();

    return () => {
      cancelled = true;
    };
  }, [lang, viewingGameId]);

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lang", lang);
      fd.append("opponent", opponent);
      fd.append("gameDate", gameDate);
      fd.append("season", season);

      const res = await fetch("/api/game-review", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setReview(data.review);
      setBattingData(data.battingData || []);
      setPitchingData(data.pitchingData || []);
      setViewingPast(false);
      setViewingGameId(data.gameId || null);
      const nextSeason = data.season || season;
      const params = new URLSearchParams(searchParams.toString());
      params.set("season", nextSeason);
      router.replace(`/game-review?${params.toString()}`);
      setSeason(nextSeason);
      await fetchPastGames(nextSeason);
    } catch {
      setError(lang === "ko" ? "네트워크 오류" : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const viewPast = async (game: any) => {
    setLoadingReview(true);
    applyRecord(game);
    setViewingPast(true);
    setViewingGameId(game.id);
    try {
      const detailed = await fetchGameDetail(game.id, lang);
      applyRecord(detailed);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoadingReview(false);
    }
  };

  const deleteGame = async (gameId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const msg = lang === "ko" ? "이 경기 리뷰를 삭제하시겠습니까?" : "Delete this game review?";
    if (!confirm(msg)) return;
    try {
      await fetch(`/api/game-review?id=${gameId}`, { method: "DELETE" });
      await fetchPastGames(season);
      if (viewingGameId === gameId) {
        setReview(null);
        setViewingPast(false);
        setViewingGameId(null);
      }
    } catch (e) { console.error(e); }
  };

  const Section = ({ icon, title, color, children }: any) => (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: 0.5, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{icon} {title}</div>
      {children}
    </div>
  );

  const Txt = ({ children }: { children: string }) => (
    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{children}</div>
  );

  const displayOpponent = sanitizeOpponentName(opponent);
  const localizedBattingData = localizeBattingRows(battingData, lang);
  const localizedPitchingData = localizePitchingRows(pitchingData, lang);

  const displayReview = review
    ? sanitizeGameReviewContent(localizeObjectNameFields(review, lang), {
        opponent: displayOpponent,
        playerNames: [
          ...localizedBattingData.map((entry) => entry.name),
          ...localizedPitchingData.map((entry) => entry.name),
        ],
      })
    : null;

  return (
    <div className="app-page-shell" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div className="app-page-header" style={{ padding: "28px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>{lang === "ko" ? "← 대시보드로 돌아가기" : "← Back to Dashboard"}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📋 {lang === "ko" ? "경기 기록 AI 리뷰" : "Game Record AI Review"}</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>{lang === "ko" ? "경기 기록 엑셀 또는 현장 메모 docx를 업로드하면 AI가 수치와 흐름을 함께 분석합니다" : "Upload a game record Excel or field-notes docx for AI-powered statistical and flow analysis"}</p>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.22)", fontSize: 12, color: "#93c5fd", fontWeight: 700 }}>
            🔗 {lang === "ko" ? "현재 연결 시즌" : "Connected season"}: {season}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {/* 업로드 영역 */}
        {!review && !loading && !loadingReview && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block" }}>{lang === "ko" ? "상대팀" : "Opponent"}</label>
                <input type="text" value={opponent} onChange={(e) => setOpponent(sanitizeOpponentName(e.target.value))} placeholder={lang === "ko" ? "예: 사회인" : "e.g. Team ABC"}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, display: "block" }}>{lang === "ko" ? "경기 날짜" : "Game Date"}</label>
                <input type="text" value={gameDate} onChange={(e) => setGameDate(e.target.value)} placeholder={lang === "ko" ? "예: 2024.10.24" : "e.g. Oct 24, 2024"}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); extractFromFilename(f.name); } }}
              style={{
                border: file ? "2px solid rgba(34,197,94,0.3)" : "2px dashed rgba(255,255,255,0.1)",
                borderRadius: 16, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                background: file ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.01)", marginBottom: 20, transition: "all 0.2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); extractFromFilename(f.name); } }} style={{ display: "none" }} />
              {file ? (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{lang === "ko" ? "클릭하여 변경" : "Click to change"}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>{lang === "ko" ? "경기 기록 엑셀 또는 현장 메모 docx 파일을 드래그하거나 클릭" : "Drag or click to select a game record Excel or field-notes docx"}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>{lang === "ko" ? "타자 기록 · 투수 기록 · 주요 기록 시트의 .xlsx 또는 경기 메모용 .docx 파일" : ".xlsx with batting/pitching/highlights or a .docx field-notes file"}</div>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 14, color: "#ef4444", marginBottom: 16, textAlign: "center" }}>{error}</div>}

            <button onClick={upload} disabled={!file}
              style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none",
                background: !file ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                color: !file ? "rgba(255,255,255,0.3)" : "#fff", fontSize: 15, fontWeight: 700,
                cursor: !file ? "default" : "pointer",
              }}>
              🤖 {lang === "ko" ? "AI 경기 리뷰 생성" : "Generate AI Game Review"}
            </button>

            {/* 과거 기록 */}
            {pastGames.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📁 {lang === "ko" ? "과거 경기 리뷰" : "Past Game Reviews"}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pastGames.map((game) => (
                    <div key={game.id} onClick={() => viewPast(game)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", minWidth: 80 }}>{game.game_date || (lang === "ko" ? "날짜 미상" : "Date TBD")}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>vs {game.opponent || "?"}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{lang === "ko" ? "보기 →" : "View →"}</div>
                        <button onClick={(e) => deleteGame(game.id, e)}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; }}
                        >{lang === "ko" ? "삭제" : "Delete"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 로딩 */}
        {(loading || loadingReview) && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(59,130,246,0.2)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: "#60a5fa" }}>
              {loading
                ? (lang === "ko" ? "AI가 경기를 분석하고 있습니다..." : "AI is analyzing the game...")
                : (lang === "ko" ? "리뷰를 불러오는 중..." : "Loading review...")}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              {loading
                ? (lang === "ko" ? "15~25초 소요" : "15~25 seconds")
                : (lang === "ko" ? "잠시만 기다려주세요" : "Please wait a moment")}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* 리뷰 결과 */}
        {displayReview && !loading && !loadingReview && (
          <div>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: 1 }}>{gameDate}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>vs {displayOpponent || "?"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {viewingPast && viewingGameId && (
                  <button onClick={(e) => { deleteGame(viewingGameId, e); }}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {lang === "ko" ? "🗑 이 리뷰 삭제" : "🗑 Delete"}
                  </button>
                )}
                <button onClick={() => { setReview(null); setFile(null); setViewingPast(false); setViewingGameId(null); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {lang === "ko" ? "← 새 리뷰" : "← New Review"}
              </button>
              </div>
            </div>

            {/* 경기 요약 */}
            <div style={{ padding: "20px 24px", background: "rgba(59,130,246,0.06)", borderLeft: "4px solid #3b82f6", borderRadius: "0 14px 14px 0", fontSize: 15, color: "#cbd5e1", lineHeight: 1.8, marginBottom: 24 }}>
              {displayReview.game_summary}
            </div>

            {/* MVP */}
            {displayReview.mvp && (
              <div style={{ background: "linear-gradient(135deg, rgba(234,179,8,0.06), rgba(234,179,8,0.02))", border: "1px solid rgba(234,179,8,0.15)", borderRadius: 14, padding: 24, marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #eab308, #ca8a04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⭐</div>
                <div>
                  <div style={{ fontSize: 11, color: "#eab308", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const }}>MVP</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{displayReview.mvp.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginTop: 4 }}>{displayReview.mvp.reason}</div>
                </div>
              </div>
            )}

            {/* 경기 기록 테이블 */}
            {localizedBattingData.length > 0 && (
              <Section icon="⚾" title={lang === "ko" ? "타격 기록" : "Batting Record"} color="#22c55e">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {[lang === "ko" ? "타순" : "#", lang === "ko" ? "포지션" : "POS", lang === "ko" ? "이름" : "Name", lang === "ko" ? "타수" : "AB", lang === "ko" ? "안타" : "H", "2B", "3B", "HR", lang === "ko" ? "타점" : "RBI", lang === "ko" ? "득점" : "R", "BB", "SO", "AVG"].map((h) => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {localizedBattingData.map((b: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "6px", color: "rgba(255,255,255,0.35)" }}>{b.order}</td>
                          <td style={{ padding: "6px", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{b.position}</td>
                          <td style={{ padding: "6px", fontWeight: 700 }}>{b.name}</td>
                          <td style={{ padding: "6px" }}>{b.ab}</td>
                          <td style={{ padding: "6px", fontWeight: 700, color: b.hits >= 2 ? "#22c55e" : "#e2e8f0" }}>{b.hits}</td>
                          <td style={{ padding: "6px" }}>{b.doubles}</td>
                          <td style={{ padding: "6px" }}>{b.triples}</td>
                          <td style={{ padding: "6px", fontWeight: 700, color: b.hr > 0 ? "#eab308" : "#e2e8f0" }}>{b.hr}</td>
                          <td style={{ padding: "6px" }}>{b.rbi}</td>
                          <td style={{ padding: "6px" }}>{b.runs}</td>
                          <td style={{ padding: "6px" }}>{b.bb}</td>
                          <td style={{ padding: "6px", color: b.so >= 2 ? "#ef4444" : "#e2e8f0" }}>{b.so}</td>
                          <td style={{ padding: "6px", fontWeight: 700, color: parseFloat(b.avg) >= 0.5 ? "#22c55e" : "#e2e8f0" }}>{formatRateStat(b.avg, 3, "0.000")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* 투수 기록 테이블 */}
            {localizedPitchingData.length > 0 && (
              <Section icon="🏏" title={lang === "ko" ? "투수 기록" : "Pitching Record"} color="#60a5fa">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        {[lang === "ko" ? "이름" : "Name", lang === "ko" ? "결과" : "Dec", "IP", lang === "ko" ? "투구" : "NP", lang === "ko" ? "피안타" : "HA", lang === "ko" ? "자책" : "ER", "BB", "SO", "ERA"].map((h) => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {localizedPitchingData.map((p: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "6px", fontWeight: 700 }}>{p.name}</td>
                          <td style={{ padding: "6px", fontWeight: 700, color: p.decision === "승" || p.decision === "W" ? "#22c55e" : p.decision === "패" || p.decision === "L" ? "#ef4444" : "rgba(255,255,255,0.4)" }}>{p.decision || "-"}</td>
                          <td style={{ padding: "6px" }}>{p.ip}</td>
                          <td style={{ padding: "6px" }}>{p.pitches}</td>
                          <td style={{ padding: "6px" }}>{p.ha}</td>
                          <td style={{ padding: "6px" }}>{p.er}</td>
                          <td style={{ padding: "6px", color: p.bb >= 3 ? "#ef4444" : "#e2e8f0" }}>{p.bb}</td>
                          <td style={{ padding: "6px", fontWeight: 700, color: p.so >= 3 ? "#22c55e" : "#e2e8f0" }}>{p.so}</td>
                          <td style={{ padding: "6px", fontWeight: 700 }}>{p.era}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* 타격 리뷰 */}
              <Section icon="⚾" title={lang === "ko" ? "타격 분석" : "Batting Analysis"} color="#22c55e">
                <Txt>{displayReview.batting_review?.overview || ""}</Txt>
                {displayReview.batting_review?.standout_hitters && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, marginBottom: 6 }}>{lang === "ko" ? "주요 활약" : "Standouts"}</div>
                    {displayReview.batting_review.standout_hitters.map((s: string, i: number) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, paddingLeft: 12 }}>· {s}</div>)}
                  </div>
                )}
                {displayReview.batting_review?.areas_to_improve && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(239,68,68,0.04)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                    ⚡ {displayReview.batting_review.areas_to_improve}
                  </div>
                )}
              </Section>

              {/* 투구 리뷰 */}
              <Section icon="🏏" title={lang === "ko" ? "투구 분석" : "Pitching Analysis"} color="#60a5fa">
                <Txt>{displayReview.pitching_review?.overview || ""}</Txt>
                {displayReview.pitching_review?.standout_pitchers && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, marginBottom: 6 }}>{lang === "ko" ? "주요 활약" : "Standouts"}</div>
                    {displayReview.pitching_review.standout_pitchers.map((s: string, i: number) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, paddingLeft: 12 }}>· {s}</div>)}
                  </div>
                )}
                {displayReview.pitching_review?.areas_to_improve && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(239,68,68,0.04)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                    ⚡ {displayReview.pitching_review.areas_to_improve}
                  </div>
                )}
              </Section>
            </div>

            {/* 핵심 장면 */}
            {displayReview.key_moments && (
              <Section icon="🔥" title={lang === "ko" ? "핵심 장면" : "Key Moments"} color="#eab308">
                {displayReview.key_moments.map((m: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                    <span style={{ color: "#eab308", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{m}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* 전략 분석 */}
            <Section icon="🎯" title={lang === "ko" ? "전략적 분석" : "Tactical Analysis"} color="#a78bfa">
              <Txt>{displayReview.tactical_analysis || ""}</Txt>
            </Section>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* 개선 방안 */}
              <Section icon="📈" title={lang === "ko" ? "개선 방안" : "Improvement Plan"} color="#f97316">
                {displayReview.improvement_plan?.map((s: string, i: number) => (
                  <div key={i} style={{ padding: "10px 14px", background: "rgba(249,115,22,0.04)", borderRadius: 8, borderLeft: "3px solid rgba(249,115,22,0.3)", marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                    <span style={{ fontWeight: 700, color: "#f97316", marginRight: 8 }}>{i + 1}.</span>{s}
                  </div>
                ))}
              </Section>

              {/* 다음 경기 전략 */}
              <Section icon="➡️" title={lang === "ko" ? "다음 경기 포인트" : "Next Game Strategy"} color="#ef4444">
                <Txt>{displayReview.next_game_strategy || ""}</Txt>
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
