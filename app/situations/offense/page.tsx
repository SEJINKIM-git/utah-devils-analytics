"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import DecisionCard, { type SituationRow } from "@/app/components/DecisionCard";
import SituationsSubNav from "@/app/components/SituationsSubNav";

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFENSE_TYPES = new Set([
  "steal_attempt", "bunt", "hit_and_run", "pinch_hit", "pinch_run", "other",
]);

const LEVERAGE_OPTIONS = [
  { value: "",       label: "전체 레버리지" },
  { value: "high",   label: "HIGH" },
  { value: "medium", label: "MED"  },
  { value: "low",    label: "LOW"  },
];

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? m[2] : null;
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: SituationRow[] }) {
  const withDecision = rows.filter(r => r.decision_type);
  const correct   = withDecision.filter(r => r.retrospective_eval === "correct").length;
  const incorrect = withDecision.filter(r => r.retrospective_eval === "incorrect").length;
  const pending   = withDecision.filter(r => !r.retrospective_eval || r.retrospective_eval === "pending").length;
  const pct = withDecision.length > 0 ? Math.round((correct / withDecision.length) * 100) : null;

  const chip = (label: string, val: string | number, color: string) => (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "10px 18px", display: "flex", flexDirection: "column", gap: 2, minWidth: 90,
    }}>
      <span style={{ fontSize: 22, fontWeight: 800, color }}>{val}</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
      {chip("총 결정", withDecision.length, "var(--text)")}
      {chip("정확", correct, "#22c55e")}
      {chip("오류", incorrect, "#ef4444")}
      {chip("미평가", pending, "#94a3b8")}
      {pct !== null && chip("정확도", `${pct}%`, pct >= 70 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444")}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OffenseBoardPage() {
  const searchParams = useSearchParams();
  const season = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  const [rows, setRows]       = useState<SituationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [levFilter, setLevFilter] = useState("");
  const [evalFilter, setEvalFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ season, limit: "200" });
      if (levFilter) params.set("leverage_class", levFilter);
      const res = await fetch(`/api/situations?${params}`);
      const data = await res.json();
      setRows((data.situations ?? []).filter(
        (r: SituationRow) => r.decision_type && OFFENSE_TYPES.has(r.decision_type)
      ));
    } finally {
      setLoading(false);
    }
  }, [season, levFilter]);

  useEffect(() => { load(); }, [load]);

  const handleEvalUpdate = (id: string | number, eval_: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, retrospective_eval: eval_ as SituationRow["retrospective_eval"] } : r));
  };

  const filtered = evalFilter
    ? rows.filter(r => evalFilter === "pending"
        ? (!r.retrospective_eval || r.retrospective_eval === "pending")
        : r.retrospective_eval === evalFilter)
    : rows;

  const selectStyle: React.CSSProperties = {
    background: "var(--input-bg, var(--card))", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontSize: 13, padding: "6px 10px", cursor: "pointer",
  };

  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 대시보드로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>⚔️ 공격 결정 보드</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)", border: "1px solid rgba(164,201,255,0.18)" }}>
              {season} 시즌
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            도루·번트·히트앤런·대타·대주자 등 공격 결정의 사후 평가
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <select value={levFilter} onChange={e => setLevFilter(e.target.value)} style={selectStyle}>
            {LEVERAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={evalFilter} onChange={e => setEvalFilter(e.target.value)} style={selectStyle}>
            <option value="">전체 평가</option>
            <option value="correct">✓ 정확만</option>
            <option value="incorrect">✗ 오류만</option>
            <option value="ambiguous">~ 애매</option>
            <option value="pending">? 미평가</option>
          </select>
        </div>

        {/* Summary */}
        {!loading && <SummaryBar rows={rows} />}

        {/* Card list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 60, color: "var(--text-muted)", fontSize: 13,
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚔️</div>
            {rows.length === 0
              ? "아직 기록된 공격 결정이 없습니다.\n상황 로거에서 결정을 기록해 보세요."
              : "필터 조건에 맞는 결정이 없습니다."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(row => (
              <DecisionCard key={String(row.id)} row={row} onEvalUpdate={handleEvalUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
