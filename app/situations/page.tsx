"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import SituationsSubNav from "@/app/components/SituationsSubNav";

// ── Types ─────────────────────────────────────────────────────────────────────

type Game = {
  id: number;
  date: string;
  opponent: string;
  season: string;
  result?: string | null;
  score_us?: number | null;
  score_them?: number | null;
};

type SituationOption = {
  side: "offense" | "defense";
  option_label: string;
  option_detail: string;
  risk_level: "low" | "medium" | "high";
  was_chosen: boolean;
};

type Decision = {
  decision_type: string;
  decision_summary: string;
  rationale: string;
};

type LoggedSituation = {
  situation_id: string;
  game_id: number;
  inning: number;
  inning_half: "top" | "bottom";
  base_state: number;
  out_count: number;
  score_us: number;
  score_them: number;
  leverage_index: number | null;
  leverage_class: string;
  context_note: string;
  options: SituationOption[];
  decision?: Decision;
  logged_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const LEVERAGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(239,68,68,0.12)",   text: "#ef4444", label: "HIGH" },
  medium: { bg: "rgba(234,179,8,0.12)",   text: "#eab308", label: "MED"  },
  low:    { bg: "rgba(34,197,94,0.10)",   text: "#22c55e", label: "LOW"  },
};

const DECISION_TYPES = [
  { value: "pitching_change",   label: "투수 교체"       },
  { value: "steal_attempt",     label: "도루 시도"       },
  { value: "bunt",              label: "번트"            },
  { value: "hit_and_run",       label: "히트앤런"        },
  { value: "intentional_walk",  label: "고의사구"        },
  { value: "defensive_shift",   label: "수비 시프트"     },
  { value: "pinch_hit",         label: "대타"            },
  { value: "pinch_run",         label: "대주자"          },
  { value: "infield_in",        label: "내야 전진"       },
  { value: "no_doubles",        label: "노더블 얼라인"   },
  { value: "other",             label: "기타"            },
];

// base_state bitmask: bit0=1루, bit1=2루, bit2=3루
function baseLabel(state: number): string {
  if (state === 0) return "주자 없음";
  const parts: string[] = [];
  if (state & 1) parts.push("1루");
  if (state & 2) parts.push("2루");
  if (state & 4) parts.push("3루");
  return parts.join(" · ");
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SituationsPage() {
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  // ── games
  const [games, setGames]         = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  // ── form state
  const [inning, setInning]               = useState(1);
  const [inningHalf, setInningHalf]       = useState<"top" | "bottom">("top");
  const [baseState, setBaseState]         = useState(0);
  const [outCount, setOutCount]           = useState(0);
  const [scoreUs, setScoreUs]             = useState(0);
  const [scoreThem, setScoreThem]         = useState(0);
  const [contextNote, setContextNote]     = useState("");
  const [options, setOptions]             = useState<SituationOption[]>([]);
  const [showDecision, setShowDecision]   = useState(false);
  const [decision, setDecision]           = useState<Decision>({ decision_type: "", decision_summary: "", rationale: "" });

  // ── UI state
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [lastResult, setLastResult]       = useState<{ li: number | null; lc: string; situation_id?: string } | null>(null);
  const [sessionLog, setSessionLog]       = useState<LoggedSituation[]>([]);
  const [dbLog, setDbLog]                 = useState<LoggedSituation[]>([]);
  const [showOptions, setShowOptions]     = useState(false);

  // ── Load existing situations from DB when game changes
  useEffect(() => {
    if (!selectedGameId) { setDbLog([]); return; }
    fetch(`/api/situations?game_id=${selectedGameId}&season=${season}&limit=50`)
      .then(r => r.json())
      .then(data => {
        type ApiRow = {
          id: string; game_id: number; inning: number; inning_half: "top" | "bottom";
          base_state: number; out_count: number; score_us: number; score_them: number;
          leverage_index: number | null; leverage_class: string; context_note: string | null;
          decision_type: string | null; decision_summary: string | null;
          logged_at: string | null;
        };
        setDbLog((data.situations ?? []).map((r: ApiRow): LoggedSituation => ({
          situation_id: String(r.id),
          game_id:       r.game_id,
          inning:        r.inning,
          inning_half:   r.inning_half,
          base_state:    r.base_state,
          out_count:     r.out_count,
          score_us:      r.score_us,
          score_them:    r.score_them,
          leverage_index: r.leverage_index,
          leverage_class: r.leverage_class ?? "medium",
          context_note:  r.context_note ?? "",
          options:       [],
          decision: r.decision_type ? {
            decision_type:    r.decision_type,
            decision_summary: r.decision_summary ?? "",
            rationale:        "",
          } : undefined,
          logged_at: r.logged_at ?? "",
        })));
      })
      .catch(() => {});
  }, [selectedGameId, season]);

  // ── Fetch games
  useEffect(() => {
    fetch("/api/games")
      .then(r => r.json())
      .then((data: Game[]) => {
        const filtered = (Array.isArray(data) ? data : [])
          .filter(g => g.season === season)
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
        setGames(filtered);
        if (filtered.length > 0) setSelectedGameId(String(filtered[0].id));
      })
      .catch(() => {});
  }, [season]);

  // ── Toggle base
  const toggleBase = (bit: number) => setBaseState(prev => prev ^ bit);

  // ── Options helpers
  const addOption = (side: "offense" | "defense") => {
    setOptions(prev => [...prev, { side, option_label: "", option_detail: "", risk_level: "medium", was_chosen: false }]);
    setShowOptions(true);
  };
  const updateOption = (index: number, patch: Partial<SituationOption>) => {
    setOptions(prev => prev.map((o, i) => i === index ? { ...o, ...patch } : o));
  };
  const removeOption = (index: number) => {
    setOptions(prev => prev.filter((_, i) => i !== index));
  };
  const setChosenOption = (index: number) => {
    setOptions(prev => prev.map((o, i) => ({ ...o, was_chosen: i === index })));
  };

  // ── Submit
  const handleSubmit = useCallback(async () => {
    if (!selectedGameId) { setError("경기를 선택해주세요"); return; }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        game_id:     parseInt(selectedGameId),
        season,
        inning,
        inning_half: inningHalf,
        base_state:  baseState,
        out_count:   outCount,
        score_us:    scoreUs,
        score_them:  scoreThem,
        context_note: contextNote || null,
        options: options.filter(o => o.option_label.trim()),
      };
      if (showDecision && decision.decision_type) {
        body.decision = {
          decision_type:    decision.decision_type,
          decision_summary: decision.decision_summary,
          rationale:        decision.rationale || null,
          retrospective_eval: "pending",
        };
      }

      const res  = await fetch("/api/situations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "오류 발생"); return; }

      setLastResult({ li: data.leverage_index, lc: data.leverage_class, situation_id: data.situation_id });
      setSessionLog(prev => [{
        situation_id: data.situation_id,
        game_id: parseInt(selectedGameId),
        inning,
        inning_half:    inningHalf,
        base_state:     baseState,
        out_count:      outCount,
        score_us:       scoreUs,
        score_them:     scoreThem,
        leverage_index: data.leverage_index,
        leverage_class: data.leverage_class,
        context_note:   contextNote,
        options:        [...options],
        decision:       showDecision && decision.decision_type ? { ...decision } : undefined,
        logged_at:      new Date().toISOString(),
      }, ...prev]);

      // Reset form (keep game + score context)
      setOutCount(0);
      setBaseState(0);
      setContextNote("");
      setOptions([]);
      setShowDecision(false);
      setDecision({ decision_type: "", decision_summary: "", rationale: "" });
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [selectedGameId, season, inning, inningHalf, baseState, outCount, scoreUs, scoreThem, contextNote, options, showDecision, decision]);

  const selectedGame = games.find(g => String(g.id) === selectedGameId);
  const lev = lastResult ? (LEVERAGE_COLORS[lastResult.lc] ?? LEVERAGE_COLORS.medium) : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* ── Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 대시보드로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>⚡ 상황 로거</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.18)" }}>
              {season} 시즌
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            경기 중 고레버리지 상황을 기록하고 결정 로그를 쌓습니다
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        {/* ── Left: Form ───────────────────────────────────────────────────── */}
        <div>

          {/* Game Selector */}
          <div style={cardStyle}>
            <SectionLabel icon="🏟️" label="경기 선택" />
            {games.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
                이 시즌에 등록된 경기가 없습니다.{" "}
                <Link href={`/schedule?season=${season}`} style={{ color: "var(--brand-blue)" }}>일정 페이지</Link>에서 경기를 추가해주세요.
              </p>
            ) : (
              <select
                value={selectedGameId}
                onChange={e => setSelectedGameId(e.target.value)}
                style={selectStyle}
              >
                {games.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.date} vs {g.opponent}
                    {g.result ? ` (${g.result} ${g.score_us ?? "?"}–${g.score_them ?? "?"})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Inning */}
          <div style={cardStyle}>
            <SectionLabel icon="⏱️" label="이닝" />
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StepButton onClick={() => setInning(i => Math.max(1, i - 1))} label="−" />
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", minWidth: 36, textAlign: "center" }}>{inning}</span>
                <StepButton onClick={() => setInning(i => Math.min(15, i + 1))} label="+" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <HalfButton active={inningHalf === "top"} label="초 (공격)" onClick={() => setInningHalf("top")} />
                <HalfButton active={inningHalf === "bottom"} label="말 (공격)" onClick={() => setInningHalf("bottom")} />
              </div>
            </div>
          </div>

          {/* Score */}
          <div style={cardStyle}>
            <SectionLabel icon="🏆" label="현재 점수" />
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <ScoreInput label="우리팀" value={scoreUs} onChange={setScoreUs} color="var(--brand-blue)" />
              <span style={{ fontSize: 20, color: "var(--text-dim)", fontWeight: 700 }}>–</span>
              <ScoreInput label="상대팀" value={scoreThem} onChange={setScoreThem} color="var(--text-muted)" />
              <div style={{ marginLeft: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>득실차</div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: scoreUs > scoreThem ? "var(--success)" : scoreUs < scoreThem ? "#ef4444" : "var(--text-dim)"
                }}>
                  {scoreUs > scoreThem ? `+${scoreUs - scoreThem}` : scoreUs < scoreThem ? `${scoreUs - scoreThem}` : "동점"}
                </div>
              </div>
            </div>
          </div>

          {/* Base State + Out Count */}
          <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Diamond */}
            <div>
              <SectionLabel icon="⚾" label="주자 상태" />
              <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
                {/* 2루 */}
                <BaseButton active={!!(baseState & 2)} onClick={() => toggleBase(2)}
                  style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)" }} label="2" />
                {/* 3루 */}
                <BaseButton active={!!(baseState & 4)} onClick={() => toggleBase(4)}
                  style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%) rotate(45deg)" }} label="3" />
                {/* 1루 */}
                <BaseButton active={!!(baseState & 1)} onClick={() => toggleBase(1)}
                  style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%) rotate(45deg)" }} label="1" />
                {/* 홈 */}
                <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 20, height: 20, background: "var(--text-dim)", clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }} />
                {/* Diamond lines */}
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  <line x1="70" y1="16" x2="16" y2="70" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                  <line x1="70" y1="16" x2="124" y2="70" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                  <line x1="16" y1="70" x2="70" y2="128" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                  <line x1="124" y1="70" x2="70" y2="128" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                </svg>
              </div>
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                {baseLabel(baseState)}
              </div>
            </div>

            {/* Out Count */}
            <div>
              <SectionLabel icon="🔴" label="아웃카운트" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {[0, 1, 2].map(n => (
                  <button key={n} onClick={() => setOutCount(n)}
                    style={{
                      padding: "12px 16px", borderRadius: 10, border: "1px solid",
                      borderColor: outCount === n ? "#ef4444" : "var(--border)",
                      background: outCount === n ? "rgba(239,68,68,0.12)" : "var(--input-bg)",
                      color: outCount === n ? "#ef4444" : "var(--text-muted)",
                      fontWeight: 700, fontSize: 14, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                    <span style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < n ? "#ef4444" : "var(--border)", border: "1px solid", borderColor: i < n ? "#ef4444" : "rgba(255,255,255,0.15)" }} />
                      ))}
                    </span>
                    {n} 아웃
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Context Note */}
          <div style={cardStyle}>
            <SectionLabel icon="📝" label="상황 메모 (선택)" />
            <textarea
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
              placeholder="예: 선발투수 80구 소화, 상대 3번 타자, 접전 상황..."
              rows={2}
              style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
            />
          </div>

          {/* Options Section */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <SectionLabel icon="🎯" label="선택지 (선택)" noMargin />
              <div style={{ display: "flex", gap: 8 }}>
                <OptionAddButton side="offense" onClick={() => addOption("offense")} />
                <OptionAddButton side="defense" onClick={() => addOption("defense")} />
              </div>
            </div>
            {options.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-dim)" }}>위 버튼으로 공격/수비 선택지를 추가하세요</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {options.map((opt, i) => (
                  <div key={i} style={{
                    padding: "12px 14px", borderRadius: 10,
                    background: opt.was_chosen ? "rgba(34,197,94,0.06)" : "var(--input-bg)",
                    border: `1px solid ${opt.was_chosen ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
                  }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: opt.side === "offense" ? "rgba(164,201,255,0.12)" : "rgba(234,179,8,0.12)",
                        color: opt.side === "offense" ? "var(--brand-blue)" : "#eab308" }}>
                        {opt.side === "offense" ? "공격" : "수비"}
                      </span>
                      <select value={opt.risk_level} onChange={e => updateOption(i, { risk_level: e.target.value as SituationOption["risk_level"] })}
                        style={{ ...selectStyle, flex: "none", width: 80, padding: "3px 6px", fontSize: 11 }}>
                        <option value="low">낮음</option>
                        <option value="medium">중간</option>
                        <option value="high">높음</option>
                      </select>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setChosenOption(i)} style={{ ...smallBtnStyle, background: opt.was_chosen ? "rgba(34,197,94,0.15)" : "var(--input-bg)", color: opt.was_chosen ? "#22c55e" : "var(--text-dim)", borderColor: opt.was_chosen ? "rgba(34,197,94,0.3)" : "var(--border)" }}>
                        {opt.was_chosen ? "✓ 선택됨" : "선택"}
                      </button>
                      <button onClick={() => removeOption(i)} style={{ ...smallBtnStyle, color: "var(--text-dim)" }}>✕</button>
                    </div>
                    <input value={opt.option_label} onChange={e => updateOption(i, { option_label: e.target.value })}
                      placeholder="선택지 이름 (예: 도루 시도)" style={{ ...inputStyle, marginBottom: 6, fontSize: 13 }} />
                    <input value={opt.option_detail} onChange={e => updateOption(i, { option_detail: e.target.value })}
                      placeholder="상세 내용 (선택)" style={{ ...inputStyle, fontSize: 12, color: "var(--text-muted)" }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Decision Section */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: showDecision ? 16 : 0 }}>
              <SectionLabel icon="⚡" label="결정 기록 (선택)" noMargin />
              <button onClick={() => setShowDecision(v => !v)} style={{ ...smallBtnStyle, color: showDecision ? "var(--brand-blue)" : "var(--text-dim)", borderColor: showDecision ? "rgba(164,201,255,0.3)" : "var(--border)" }}>
                {showDecision ? "닫기" : "+ 열기"}
              </button>
            </div>
            {showDecision && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={labelStyle}>결정 유형</label>
                  <select value={decision.decision_type} onChange={e => setDecision(d => ({ ...d, decision_type: e.target.value }))} style={selectStyle}>
                    <option value="">선택...</option>
                    {DECISION_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>결정 요약</label>
                  <input value={decision.decision_summary} onChange={e => setDecision(d => ({ ...d, decision_summary: e.target.value }))}
                    placeholder="예: 7회 말, 이호원 투수 교체" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>근거 / 이유</label>
                  <textarea value={decision.rationale} onChange={e => setDecision(d => ({ ...d, rationale: e.target.value }))}
                    placeholder="결정의 근거를 기록하세요" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading || !selectedGameId}
            style={{
              width: "100%", padding: "16px", borderRadius: 12, border: "none",
              background: !selectedGameId ? "rgba(255,255,255,0.05)" : loading ? "rgba(164,201,255,0.2)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              color: !selectedGameId ? "rgba(255,255,255,0.3)" : "#fff",
              fontSize: 15, fontWeight: 700, cursor: !selectedGameId ? "default" : "pointer",
              marginBottom: 8,
            }}>
            {loading ? "기록 중..." : "⚡ 상황 기록"}
          </button>

          {/* LI Result */}
          {lastResult && lev && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "16px 20px", borderRadius: 12, background: lev.bg, border: `1px solid ${lev.text}33`, display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: lev.text, fontWeight: 700, letterSpacing: 1 }}>LEVERAGE INDEX</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: lev.text }}>
                    {lastResult.li != null ? lastResult.li.toFixed(2) : "—"}
                  </div>
                </div>
                <div style={{ padding: "4px 12px", borderRadius: 8, background: lev.bg, border: `1px solid ${lev.text}55`, fontSize: 13, fontWeight: 800, color: lev.text }}>
                  {lev.label} LEVERAGE
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "auto" }}>기록 완료 ✓</div>
              </div>
              {lastResult.situation_id && (
                <Link
                  href={`/situations/${lastResult.situation_id}?season=${season}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "10px 16px", borderRadius: 12, textDecoration: "none",
                    background: "rgba(164,201,255,0.08)", border: "1px solid rgba(164,201,255,0.28)",
                    color: "var(--brand-blue)", fontSize: 13, fontWeight: 700,
                    transition: "all 0.15s",
                  }}
                >
                  🤖 AI 전략 분석 받기
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Session Log ─────────────────────────────────────────────── */}
        <div style={{ position: "sticky", top: 100 }}>
          <div style={cardStyle}>
            {(() => {
              const merged = [
                ...sessionLog,
                ...dbLog.filter(d => !sessionLog.some(s => s.situation_id === d.situation_id)),
              ];
              const total = merged.length;
              return (
                <>
                  <SectionLabel icon="📋" label={`경기 기록 (${total}건)`} />
                  {total === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-dim)", fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                      아직 기록된 상황이 없습니다
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "65vh", overflowY: "auto" }}>
                      {merged.map((sit, i) => {
                  const lc = LEVERAGE_COLORS[sit.leverage_class] ?? LEVERAGE_COLORS.medium;
                  return (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: "var(--input-bg)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                          {sit.inning}회 {sit.inning_half === "top" ? "초" : "말"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: lc.bg, color: lc.text }}>
                          {lc.label}
                        </span>
                        {sit.leverage_index != null && (
                          <span style={{ fontSize: 11, color: lc.text, marginLeft: "auto" }}>LI {sit.leverage_index.toFixed(2)}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {sit.out_count}사 · {baseLabel(sit.base_state)} · {sit.score_us}–{sit.score_them}
                      </div>
                      {sit.context_note && (
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, fontStyle: "italic" }}>{sit.context_note}</div>
                      )}
                      {sit.decision?.decision_type && (
                        <div style={{ marginTop: 6, fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(164,201,255,0.08)", color: "var(--brand-blue)", display: "inline-block" }}>
                          {DECISION_TYPES.find(d => d.value === sit.decision?.decision_type)?.label ?? sit.decision.decision_type}
                        </div>
                      )}
                    </div>
                  );
                })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Game summary */}
          {selectedGame && (
            <div style={{ ...cardStyle, marginTop: 0 }}>
              <SectionLabel icon="🏟️" label="현재 경기" />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                vs {selectedGame.opponent}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{selectedGame.date}</div>
              {selectedGame.result && (
                <div style={{ marginTop: 8, fontSize: 13, color: selectedGame.result === "W" ? "var(--success)" : selectedGame.result === "L" ? "#ef4444" : "var(--text-muted)", fontWeight: 700 }}>
                  {selectedGame.result === "W" ? "승" : selectedGame.result === "L" ? "패" : "무"} {selectedGame.score_us ?? "?"}–{selectedGame.score_them ?? "?"}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Mobile responsive override */}
      <style>{`
        @media (max-width: 768px) {
          .situations-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, label, noMargin }: { icon: string; label: string; noMargin?: boolean }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6, marginBottom: noMargin ? 0 : 12 }}>
      {icon} {label.toUpperCase()}
    </div>
  );
}

function StepButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {label}
    </button>
  );
}

function HalfButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 10, border: "1px solid",
      borderColor: active ? "var(--brand-blue)" : "var(--border)",
      background: active ? "rgba(164,201,255,0.1)" : "var(--input-bg)",
      color: active ? "var(--brand-blue)" : "var(--text-dim)",
      fontSize: 13, fontWeight: 700, cursor: "pointer",
    }}>
      {label}
    </button>
  );
}

function ScoreInput({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-dim)", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>−</button>
        <span style={{ fontSize: 28, fontWeight: 800, color, minWidth: 36, textAlign: "center" }}>{value}</span>
        <button onClick={() => onChange(value + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-dim)", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>+</button>
      </div>
    </div>
  );
}

function BaseButton({ active, onClick, style: extraStyle, label }: { active: boolean; onClick: () => void; style?: React.CSSProperties; label: string }) {
  return (
    <button
      onClick={onClick}
      title={`${label}루`}
      style={{
        width: 28, height: 28,
        background: active ? "var(--brand-blue)" : "var(--surface-high)",
        border: `2px solid ${active ? "var(--brand-blue)" : "rgba(255,255,255,0.15)"}`,
        cursor: "pointer",
        transition: "all 0.15s",
        ...extraStyle,
      }}
    />
  );
}

function OptionAddButton({ side, onClick }: { side: "offense" | "defense"; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 8,
      border: `1px solid ${side === "offense" ? "rgba(164,201,255,0.25)" : "rgba(234,179,8,0.25)"}`,
      background: side === "offense" ? "rgba(164,201,255,0.06)" : "rgba(234,179,8,0.06)",
      color: side === "offense" ? "var(--brand-blue)" : "#eab308",
      fontSize: 12, fontWeight: 700, cursor: "pointer",
    }}>
      + {side === "offense" ? "공격" : "수비"}
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "20px 22px",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
  fontFamily: "var(--font-body)",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-dim)",
  marginBottom: 6,
  letterSpacing: 0.5,
};

const smallBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  color: "var(--text-dim)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
