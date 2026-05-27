"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AICard = {
  action: string;
  action_type: string;
  recommendation: "권장" | "고려" | "주의" | "비권장";
  confidence: number;
  rationale: string;
  historical_note?: string | null;
};

export type AIRecommendResult = {
  context_summary?: string;
  primary_recommendation?: string;
  primary_action_type?: string;
  cards: AICard[];
  similar_count?: number;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const REC_CONFIG: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  "권장":   { bg: "rgba(34,197,94,0.13)",  text: "#22c55e", border: "rgba(34,197,94,0.3)",  icon: "✓" },
  "고려":   { bg: "rgba(164,201,255,0.12)", text: "#60a5fa", border: "rgba(164,201,255,0.3)", icon: "→" },
  "주의":   { bg: "rgba(234,179,8,0.13)",  text: "#eab308", border: "rgba(234,179,8,0.3)",  icon: "!" },
  "비권장": { bg: "rgba(239,68,68,0.13)",  text: "#ef4444", border: "rgba(239,68,68,0.3)",  icon: "✗" },
};

// ── Confidence Bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct  = Math.min(100, Math.max(0, Math.round(value * 100)));
  const color = pct >= 70 ? "#22c55e" : pct >= 45 ? "#eab308" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--border)" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color,
          width: `${pct}%`, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Single Action Card ─────────────────────────────────────────────────────────

function ActionCard({ card, isPrimary }: { card: AICard; isPrimary: boolean }) {
  const rec = REC_CONFIG[card.recommendation] ?? REC_CONFIG["고려"];
  return (
    <div style={{
      background: "var(--card)", border: `1px solid ${isPrimary ? rec.border : "var(--border)"}`,
      borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
      boxShadow: isPrimary ? `0 0 0 1px ${rec.border}` : "none",
      position: "relative",
    }}>
      {isPrimary && (
        <span style={{
          position: "absolute", top: -8, left: 12, fontSize: 9, fontWeight: 800,
          padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5,
          background: rec.bg, color: rec.text, border: `1px solid ${rec.border}`,
        }}>
          PRIMARY
        </span>
      )}

      {/* Header: action + recommendation badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", flex: 1 }}>
          {card.action}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
          background: rec.bg, color: rec.text, border: `1px solid ${rec.border}`,
        }}>
          {rec.icon} {card.recommendation}
        </span>
      </div>

      {/* Confidence bar */}
      <ConfidenceBar value={card.confidence} />

      {/* Rationale */}
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.6 }}>
        {card.rationale}
      </p>

      {/* Historical note */}
      {card.historical_note && (
        <p style={{
          fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.5,
          paddingTop: 6, borderTop: "1px solid var(--border)",
          fontStyle: "italic",
        }}>
          📋 {card.historical_note}
        </p>
      )}
    </div>
  );
}

// ── Loading Dots ──────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%", background: "var(--brand-blue)",
            display: "inline-block",
            animation: `aiDot 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes aiDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AIActionCards({ situationId }: { situationId: string | number }) {
  const [result,  setResult]  = useState<AIRecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function fetchRecommendations() {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/situations/${situationId}/ai-recommend`, { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data as AIRecommendResult);
    } catch {
      setError("AI 분석 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // ── Not yet fetched ─────────────────────────────────────────────────────────
  if (!result && !loading) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
        padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 28 }}>🤖</div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            AI 전략 분석
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0", lineHeight: 1.5 }}>
            이 상황에서의 전략적 선택지를 AI가 분석하고<br />신뢰도와 근거를 제공합니다
          </p>
        </div>
        {error && (
          <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>
        )}
        <button
          onClick={fetchRecommendations}
          style={{
            padding: "8px 20px", borderRadius: 999, cursor: "pointer",
            fontSize: 13, fontWeight: 700,
            background: "rgba(164,201,255,0.12)", color: "var(--brand-blue)",
            border: "1px solid rgba(164,201,255,0.28)",
            transition: "all 0.15s",
          }}
        >
          🤖 AI 분석 시작
        </button>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
        padding: "28px 22px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
        textAlign: "center",
      }}>
        <LoadingDots />
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          상황을 분석하는 중…
        </p>
      </div>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  const cards = result?.cards ?? [];
  if (cards.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
        padding: "20px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          추천 카드를 생성하지 못했습니다.
        </p>
        <button onClick={() => { setResult(null); setError(""); }}
          style={{ marginTop: 10, fontSize: 12, background: "none", border: "none",
            cursor: "pointer", color: "var(--text-dim)" }}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Context summary */}
      {result?.context_summary && (
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(164,201,255,0.06)", border: "1px solid rgba(164,201,255,0.15)",
          fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <span>🤖</span>
          <span>{result.context_summary}</span>
        </div>
      )}

      {/* Similar cases note */}
      {result?.similar_count != null && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
          유사 사례 {result.similar_count}건 참고
        </p>
      )}

      {/* Action cards */}
      {cards.map((card, i) => (
        <ActionCard
          key={i}
          card={card}
          isPrimary={card.action_type === result?.primary_action_type}
        />
      ))}

      {/* Refresh */}
      <button
        onClick={() => { setResult(null); setError(""); }}
        style={{
          alignSelf: "flex-end", fontSize: 11, background: "none",
          border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px 0",
        }}
      >
        ↺ 재분석
      </button>
    </div>
  );
}
