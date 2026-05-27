"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ACTIVE_SEASON_COOKIE } from "@/lib/season";
import DecisionCard, { type SituationRow } from "@/app/components/DecisionCard";
import SituationsSubNav from "@/app/components/SituationsSubNav";
import AIActionCards from "@/app/components/AIActionCards";

// ── Types ─────────────────────────────────────────────────────────────────────

type SimilarCase = {
  id?: string;
  situation_id?: string;
  game_id?: number;
  inning?: number;
  base_state?: number;
  out_count?: number;
  leverage_class?: string;
  decision_type?: string | null;
  decision_summary?: string | null;
  retrospective_eval?: string | null;
  score_diff?: number | null;
  similarity?: number | null;
  [key: string]: unknown;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DECISION_LABEL: Record<string, string> = {
  pitching_change: "투수 교체", steal_attempt: "도루 시도", bunt: "번트",
  hit_and_run: "히트앤런", intentional_walk: "고의사구", defensive_shift: "수비 시프트",
  pinch_hit: "대타", pinch_run: "대주자", infield_in: "내야 전진",
  no_doubles: "노더블 얼라인", other: "기타",
};

const LEV_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(239,68,68,0.13)",  text: "#ef4444", label: "HIGH" },
  medium: { bg: "rgba(234,179,8,0.13)",  text: "#eab308", label: "MED"  },
  low:    { bg: "rgba(34,197,94,0.10)",  text: "#22c55e", label: "LOW"  },
};

const EVAL_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  correct:   { icon: "✓", label: "정확",  color: "#22c55e" },
  incorrect: { icon: "✗", label: "오류",  color: "#ef4444" },
  ambiguous: { icon: "~", label: "애매",  color: "#eab308" },
  pending:   { icon: "?", label: "미평가", color: "#94a3b8" },
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

// ── Similar Case Card ─────────────────────────────────────────────────────────

function SimilarCaseCard({ c }: { c: SimilarCase }) {
  const lc = c.leverage_class ?? "medium";
  const lev = LEV_COLOR[lc] ?? LEV_COLOR.medium;
  const eval_ = c.retrospective_eval ?? "pending";
  const evalCfg = EVAL_CONFIG[eval_] ?? EVAL_CONFIG.pending;
  const caseId = c.id ?? c.situation_id;

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
          background: lev.bg, color: lev.text }}>
          {lev.label}
        </span>
        {c.inning != null && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            {c.inning}회
          </span>
        )}
        {c.base_state != null && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{baseLabel(c.base_state)}</span>
        )}
        {c.out_count != null && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.out_count}아웃</span>
        )}
        {c.score_diff != null && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {c.score_diff > 0 ? `+${c.score_diff}` : String(c.score_diff)} 점차
          </span>
        )}
        {c.similarity != null && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
            유사도 {(c.similarity * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {c.decision_type && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, flexShrink: 0,
            background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
            border: "1px solid rgba(164,201,255,0.18)" }}>
            {DECISION_LABEL[c.decision_type] ?? c.decision_type}
          </span>
          {c.decision_summary && (
            <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
              {String(c.decision_summary)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: evalCfg.color }}>
          {evalCfg.icon} {evalCfg.label}
        </span>
        {caseId && (
          <Link href={`/situations/${caseId}`} style={{ marginLeft: "auto", fontSize: 10,
            color: "var(--text-muted)", textDecoration: "none" }}>
            상세 보기 →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SituationDetailPage() {
  const params        = useParams();
  const searchParams  = useSearchParams();
  const id            = params.id as string;
  const season        = searchParams.get("season") || getCookie(ACTIVE_SEASON_COOKIE) || "2026";

  const [row,    setRow]    = useState<SituationRow | null>(null);
  const [cases,  setCases]  = useState<SimilarCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [error,   setError]  = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    fetch(`/api/situations/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setRow(data.situation);

        // Fetch similar cases
        setLoadingCases(true);
        return fetch(`/api/situations/${id}/evaluate`);
      })
      .then(r => r?.json())
      .then(data => {
        if (data?.similar_cases) setCases(data.similar_cases);
      })
      .catch(() => setError("불러오기 실패"))
      .finally(() => { setLoading(false); setLoadingCases(false); });
  }, [id]);

  const handleEvalUpdate = (_id: string | number, eval_: string) => {
    setRow(prev => prev ? { ...prev, retrospective_eval: eval_ as SituationRow["retrospective_eval"] } : prev);
  };

  return (
    <div className="app-page-shell" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="app-page-header" style={{ padding: "28px 40px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href={`/situations/hub?season=${season}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 13, display: "block", marginBottom: 14 }}>
            ← 허브로 돌아가기
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--text)" }}>상황 상세</h1>
            {row && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
                border: "1px solid rgba(164,201,255,0.18)" }}>
                {season} 시즌
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px 60px" }}>
        <SituationsSubNav season={season} />

        {loading && (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)", fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {error && !loading && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 12, padding: "16px 20px", color: "#ef4444", fontSize: 13 }}>
            {error}
          </div>
        )}

        {row && !loading && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>

            {/* ── Left: situation + AI */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                  letterSpacing: 0.5, marginBottom: 12 }}>
                  현재 상황
                </div>
                <DecisionCard
                  row={row}
                  noteMode={true}
                  onEvalUpdate={handleEvalUpdate}
                />
              </div>

              {/* AI Action Cards */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                  letterSpacing: 0.5, marginBottom: 12 }}>
                  AI 전략 추천
                </div>
                <AIActionCards situationId={row.id} />
              </div>
            </div>

            {/* ── Right: Similar cases */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                letterSpacing: 0.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                유사 사례
                {loadingCases && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>
                    검색 중…
                  </span>
                )}
              </div>

              {!loadingCases && cases.length === 0 && (
                <div style={{
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
                  padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: 12,
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  유사한 과거 상황이 없습니다
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cases.map((c, i) => (
                  <SimilarCaseCard key={String(c.id ?? c.situation_id ?? i)} c={c} />
                ))}
              </div>

              {cases.length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px",
                  background: "rgba(164,201,255,0.06)", border: "1px solid rgba(164,201,255,0.15)",
                  borderRadius: 10, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  💡 유사 사례는 이닝·주자·아웃·점수차·레버리지가 비슷한 과거 상황입니다.
                  결정 패턴과 평가 결과를 참고하세요.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
