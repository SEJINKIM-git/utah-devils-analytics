"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AIButton({
  playerId,
  hasReport,
  lang = "ko",
}: {
  playerId: number;
  hasReport?: boolean;
  lang?: "ko" | "en";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const texts = {
    analyze: lang === "ko" ? "🤖 AI 분석 받기" : "🤖 Get AI Analysis",
    reanalyze: lang === "ko" ? "🔄 최신 기록으로 재분석" : "🔄 Re-analyze with Latest",
    loading: lang === "ko" ? "AI 분석 중... (10~15초)" : "Analyzing... (10~15s)",
    desc: lang === "ko" ? "AI가 이 선수의 기록을 분석하여 피드백을 생성합니다" : "AI will analyze this player's stats and generate feedback",
    networkError: lang === "ko" ? "네트워크 오류가 발생했습니다" : "Network error occurred",
    error: lang === "ko" ? "분석 중 오류가 발생했습니다" : "An error occurred during analysis",
  };

  const analyze = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, lang }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || texts.error); return; }
      router.refresh();
    } catch {
      setError(texts.networkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center" as const, padding: hasReport ? "16px 0 0 0" : "40px 0" }}>
      {!hasReport && <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>}
      {error && <div style={{ fontSize: 14, color: "#ef4444", marginBottom: 16 }}>{error}</div>}
      {!hasReport && !error && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>{texts.desc}</div>}
      <button onClick={analyze} disabled={loading} style={{
        padding: hasReport ? "10px 24px" : "12px 28px", borderRadius: 10, border: "none",
        background: loading ? "rgba(59,130,246,0.3)" : hasReport ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
        color: hasReport ? "#60a5fa" : "#fff", fontSize: hasReport ? 13 : 14, fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s",
      }}>
        {loading ? (<><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />{texts.loading}</>) : hasReport ? texts.reanalyze : texts.analyze}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}