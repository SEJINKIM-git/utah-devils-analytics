"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SituationRow = {
  id: string | number;
  game_id: number;
  season: string;
  inning: number;
  inning_half: "top" | "bottom";
  base_state: number;
  out_count: number;
  score_us: number;
  score_them: number;
  leverage_index?: number | null;
  leverage_class?: string | null;
  context_note?: string | null;
  logged_at?: string | null;
  // decision (joined from game_decisions via view)
  decision_id?: string | null;
  decision_type?: string | null;
  decision_summary?: string | null;
  rationale?: string | null;
  outcome?: string | null;
  outcome_detail?: string | null;
  runs_scored_after?: number | null;
  retrospective_eval?: "correct" | "incorrect" | "ambiguous" | "pending" | null;
  decided_by?: string | null;
  // game info (optional, may not be in all views)
  opponent?: string | null;
  game_date?: string | null;
};

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

const LEV_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(239,68,68,0.13)",  text: "#ef4444", label: "HIGH" },
  medium: { bg: "rgba(234,179,8,0.13)",  text: "#eab308", label: "MED"  },
  low:    { bg: "rgba(34,197,94,0.10)",  text: "#22c55e", label: "LOW"  },
};

const EVAL_CONFIG = {
  correct:   { icon: "✓", label: "정확", bg: "rgba(34,197,94,0.15)",  text: "#22c55e", border: "rgba(34,197,94,0.35)"  },
  incorrect: { icon: "✗", label: "오류", bg: "rgba(239,68,68,0.15)",  text: "#ef4444", border: "rgba(239,68,68,0.35)"  },
  ambiguous: { icon: "~", label: "애매", bg: "rgba(234,179,8,0.13)",  text: "#eab308", border: "rgba(234,179,8,0.35)"  },
  pending:   { icon: "?", label: "미평가", bg: "rgba(100,116,139,0.12)", text: "#94a3b8", border: "rgba(100,116,139,0.25)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseLabel(s: number) {
  if (s === 0) return "무주자";
  const p: string[] = [];
  if (s & 1) p.push("1루");
  if (s & 2) p.push("2루");
  if (s & 4) p.push("3루");
  return p.join("·");
}

function MiniDiamond({ state }: { state: number }) {
  const dot = (active: boolean) => ({
    width: 9, height: 9, borderRadius: 2,
    background: active ? "#f59e0b" : "rgba(255,255,255,0.12)",
    border: `1px solid ${active ? "#f59e0b" : "rgba(255,255,255,0.18)"}`,
    transform: "rotate(45deg)",
  });
  return (
    <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
      {/* 2루 */}
      <div style={{ ...dot(!!(state & 2)), position: "absolute", top: 0,    left: "50%", marginLeft: -4 }} />
      {/* 3루 */}
      <div style={{ ...dot(!!(state & 4)), position: "absolute", top: "50%", left: 0,    marginTop: -4 }} />
      {/* 1루 */}
      <div style={{ ...dot(!!(state & 1)), position: "absolute", top: "50%", right: 0,   marginTop: -4 }} />
      {/* 홈 */}
      <div style={{ position: "absolute", bottom: 0, left: "50%", marginLeft: -4, width: 9, height: 9,
        background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)",
        clipPath: "polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)" }} />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DecisionCard({ row, onEvalUpdate }: {
  row: SituationRow;
  onEvalUpdate?: (id: string | number, eval_: string) => void;
}) {
  const [eval_, setEval] = useState<string>(row.retrospective_eval ?? "pending");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lev = LEV_COLOR[row.leverage_class ?? "medium"] ?? LEV_COLOR.medium;
  const evalCfg = EVAL_CONFIG[eval_ as keyof typeof EVAL_CONFIG] ?? EVAL_CONFIG.pending;

  const scoreText = `${row.score_us ?? 0} - ${row.score_them ?? 0}`;
  const inningText = `${row.inning}회 ${row.inning_half === "top" ? "초" : "말"}`;
  const outText = `${row.out_count}아웃`;

  async function handleEval(next: string) {
    if (saving || !row.decision_id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/situations/${row.id}/evaluate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: row.decision_id, retrospective_eval: next }),
      });
      if (res.ok) {
        setEval(next);
        onEvalUpdate?.(row.id, next);
      }
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  return (
    <div style={card}>
      {/* ── Row 1: LI badge · inning · score · base+out */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
          background: lev.bg, color: lev.text, letterSpacing: 0.5,
        }}>
          {lev.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{inningText}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{scoreText}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>·</span>
        <MiniDiamond state={row.base_state} />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{baseLabel(row.base_state)}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{outText}</span>
        {row.leverage_index != null && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            LI {row.leverage_index.toFixed(2)}
          </span>
        )}
      </div>

      {/* ── Row 2: Decision type + summary */}
      {row.decision_type && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, flexShrink: 0,
            background: "rgba(164,201,255,0.1)", color: "var(--brand-blue)",
            border: "1px solid rgba(164,201,255,0.18)",
          }}>
            {DECISION_LABEL[row.decision_type] ?? row.decision_type}
          </span>
          {row.decision_summary && (
            <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
              {row.decision_summary}
            </span>
          )}
        </div>
      )}

      {/* ── Row 3: Context note (if no decision) */}
      {!row.decision_type && row.context_note && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
          {row.context_note}
        </p>
      )}

      {/* ── Row 4: Rationale (collapsible) */}
      {row.rationale && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {expanded ? "▾" : "▸"} 근거 보기
          </button>
          {expanded && (
            <p style={{
              margin: "8px 0 0", fontSize: 12, color: "var(--text-dim)",
              lineHeight: 1.6, paddingLeft: 12,
              borderLeft: "2px solid var(--border)",
            }}>
              {row.rationale}
            </p>
          )}
        </div>
      )}

      {/* ── Row 5: Outcome */}
      {(row.outcome || row.runs_scored_after != null) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {row.outcome && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>결과: <strong style={{ color: "var(--text)" }}>{row.outcome}</strong></span>
          )}
          {row.outcome_detail && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>— {row.outcome_detail}</span>
          )}
          {row.runs_scored_after != null && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>이후 실점: <strong style={{ color: "var(--text)" }}>{row.runs_scored_after}</strong></span>
          )}
        </div>
      )}

      {/* ── Row 6: Retrospective eval buttons (only if decision exists) */}
      {row.decision_id && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 2 }}>사후평가</span>
          {(["correct", "incorrect", "ambiguous"] as const).map(e => {
            const cfg = EVAL_CONFIG[e];
            const active = eval_ === e;
            return (
              <button
                key={e}
                onClick={() => handleEval(e)}
                disabled={saving}
                style={{
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  padding: "3px 10px", borderRadius: 999, cursor: saving ? "wait" : "pointer",
                  border: `1px solid ${active ? cfg.border : "var(--border)"}`,
                  background: active ? cfg.bg : "transparent",
                  color: active ? cfg.text : "var(--text-dim)",
                  transition: "all 0.15s",
                }}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
          {eval_ === "pending" && (
            <span style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 999,
              background: EVAL_CONFIG.pending.bg, color: EVAL_CONFIG.pending.text,
              border: `1px solid ${EVAL_CONFIG.pending.border}`,
            }}>
              ? 미평가
            </span>
          )}
        </div>
      )}

      {/* ── Footer: date/time */}
      {row.logged_at && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: -4 }}>
          {new Date(row.logged_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
