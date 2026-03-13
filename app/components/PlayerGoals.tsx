"use client";

import { useState, useEffect } from "react";

type Goal = {
  id: number;
  stat_type: string;
  stat_label: string;
  target_value: number;
  current: number;
  progress: number;
  lowerIsBetter: boolean;
};

const BATTING_PRESETS = {
  ko: [
    { type: "avg", label: "타율", placeholder: "0.300" },
    { type: "obp", label: "출루율", placeholder: "0.400" },
    { type: "ops", label: "OPS", placeholder: "0.800" },
    { type: "hits", label: "안타", placeholder: "20" },
    { type: "hr", label: "홈런", placeholder: "3" },
    { type: "rbi", label: "타점", placeholder: "15" },
    { type: "sb", label: "도루", placeholder: "10" },
    { type: "bb", label: "볼넷", placeholder: "10" },
    { type: "so_bat", label: "삼진 (이하)", placeholder: "10" },
  ],
  en: [
    { type: "avg", label: "AVG", placeholder: "0.300" },
    { type: "obp", label: "OBP", placeholder: "0.400" },
    { type: "ops", label: "OPS", placeholder: "0.800" },
    { type: "hits", label: "Hits", placeholder: "20" },
    { type: "hr", label: "HR", placeholder: "3" },
    { type: "rbi", label: "RBI", placeholder: "15" },
    { type: "sb", label: "SB", placeholder: "10" },
    { type: "bb", label: "BB", placeholder: "10" },
    { type: "so_bat", label: "SO (under)", placeholder: "10" },
  ],
};

const PITCHING_PRESETS = {
  ko: [
    { type: "era", label: "ERA (이하)", placeholder: "3.00" },
    { type: "whip", label: "WHIP (이하)", placeholder: "1.20" },
    { type: "wins", label: "승", placeholder: "5" },
    { type: "saves", label: "세이브", placeholder: "3" },
    { type: "so_pit", label: "탈삼진", placeholder: "30" },
    { type: "ip", label: "이닝", placeholder: "30" },
  ],
  en: [
    { type: "era", label: "ERA (under)", placeholder: "3.00" },
    { type: "whip", label: "WHIP (under)", placeholder: "1.20" },
    { type: "wins", label: "Wins", placeholder: "5" },
    { type: "saves", label: "Saves", placeholder: "3" },
    { type: "so_pit", label: "Strikeouts", placeholder: "30" },
    { type: "ip", label: "Innings", placeholder: "30" },
  ],
};

export default function PlayerGoals({
  playerId,
  season: propSeason,
  isPitcher,
  lang = "ko",
}: {
  playerId: number;
  season?: string;
  isPitcher: boolean;
  lang?: "ko" | "en";
}) {
  const currentSeason = propSeason || String(new Date().getFullYear());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [saving, setSaving] = useState(false);

  const presets = [
    ...(BATTING_PRESETS[lang] || BATTING_PRESETS.ko),
    ...(isPitcher ? (PITCHING_PRESETS[lang] || PITCHING_PRESETS.ko) : []),
  ];

  const fetchGoals = async () => {
    try {
      const res = await fetch(`/api/goals?playerId=${playerId}&season=${currentSeason}`);
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGoals(); }, [playerId, currentSeason]);

  const addGoal = async () => {
    if (!selectedType || !targetValue) return;
    setSaving(true);
    const preset = presets.find((p) => p.type === selectedType);
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          season: currentSeason,
          statType: selectedType,
          statLabel: preset?.label || selectedType,
          targetValue: parseFloat(targetValue),
        }),
      });
      setSelectedType("");
      setTargetValue("");
      setShowAdd(false);
      await fetchGoals();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const deleteGoal = async (goalId: number) => {
    try {
      await fetch(`/api/goals?id=${goalId}`, { method: "DELETE" });
      await fetchGoals();
    } catch (e) { console.error(e); }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "#22c55e";
    if (progress >= 70) return "#eab308";
    if (progress >= 40) return "#f97316";
    return "#ef4444";
  };

  const overallProgress = goals.length > 0
    ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length)
    : 0;

  if (loading) return null;

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{lang === "ko" ? "개인 목표" : "Personal Goals"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {lang === "ko" ? "2025 시즌 목표 달성도" : "2025 Season Goal Progress"}
            </div>
          </div>
        </div>
        {goals.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: 1 }}>{lang === "ko" ? "종합 달성률" : "Overall"}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: getProgressColor(overallProgress) }}>{overallProgress}%</div>
          </div>
        )}
      </div>

      {/* 목표 리스트 */}
      {goals.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {goals.map((goal) => (
            <div key={goal.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{goal.stat_label}</span>
                  {goal.progress >= 100 && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(34,197,94,0.15)", color: "#22c55e", fontWeight: 700 }}>{lang === "ko" ? "달성!" : "Done!"}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    {goal.lowerIsBetter
                      ? `${goal.current} → ${lang === "ko" ? "목표" : "goal"} ≤${goal.target_value}`
                      : `${goal.current} / ${goal.target_value}`}
                  </span>
                  <button onClick={() => deleteGoal(goal.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                </div>
              </div>
              <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(goal.progress, 100)}%`,
                  height: "100%",
                  background: getProgressColor(goal.progress),
                  borderRadius: 4,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: getProgressColor(goal.progress), fontWeight: 700, marginTop: 4 }}>
                {goal.progress}%
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.25)", fontSize: 13, marginBottom: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
              {lang === "ko" ? `${currentSeason} 시즌 목표가 없습니다` : `No goals set for ${currentSeason}`}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>
              {lang === "ko" ? "아래 버튼으로 시즌 목표를 추가해보세요" : "Add your first goal for this season"}
            </div>
          </div>
        </div>
      )}

      {/* 목표 추가 */}
      {showAdd ? (
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>{lang === "ko" ? "새 목표 추가" : "Add New Goal"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {presets
              .filter((p) => !goals.some((g) => g.stat_type === p.type))
              .map((p) => (
                <button key={p.type} onClick={() => { setSelectedType(p.type); setTargetValue(""); }}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: selectedType === p.type ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    background: selectedType === p.type ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.03)",
                    color: selectedType === p.type ? "#60a5fa" : "rgba(255,255,255,0.5)",
                  }}>
                  {p.label}
                </button>
              ))}
          </div>
          {selectedType && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                step="any"
                placeholder={presets.find((p) => p.type === selectedType)?.placeholder || ""}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, outline: "none" }}
              />
              <button onClick={addGoal} disabled={saving || !targetValue}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none",
                  background: !targetValue ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #f97316, #ea580c)",
                  color: !targetValue ? "rgba(255,255,255,0.3)" : "#fff",
                  fontSize: 13, fontWeight: 700, cursor: !targetValue ? "default" : "pointer",
                }}>
                {saving ? "..." : lang === "ko" ? "추가" : "Add"}
              </button>
              <button onClick={() => { setShowAdd(false); setSelectedType(""); setTargetValue(""); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          style={{
            width: "100%", padding: "10px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)",
            background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "all 0.2s",
          }}>
          + {lang === "ko" ? "목표 추가" : "Add Goal"}
        </button>
      )}
    </div>
  );
}