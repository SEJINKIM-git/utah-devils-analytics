// app/team-analysis/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function TeamAnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [season, setSeason] = useState(searchParams.get("season") || "2025");
  const [seasons, setSeasons] = useState<string[]>(["2025"]);

  const lang = getCookie("lang") === "en" ? "en" : "ko";

  useEffect(() => {
    const requestedSeason = searchParams.get("season");
    fetch("/api/seasons", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const available = data?.seasons?.length ? data.seasons : ["2025"];
        setSeasons(available);
        const nextSeason = requestedSeason && available.includes(requestedSeason)
          ? requestedSeason
          : (data?.preferredSeason || data?.latestSeason || available[0] || "2025");
        setSeason(nextSeason);
      })
      .catch(() => {
        if (requestedSeason) setSeason(requestedSeason);
      });
  }, [searchParams]);

  const changeSeason = (nextSeason: string) => {
    setSeason(nextSeason);
    setReport(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", nextSeason);
    router.replace(`/team-analysis?${params.toString()}`);
  };

  const analyze = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analyze-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, season }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        return;
      }
      setReport(data);
    } catch {
      setError(lang === "ko" ? "네트워크 오류가 발생했습니다" : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const Section = ({
    icon,
    title,
    color,
    children,
  }: {
    icon: string;
    title: string;
    color: string;
    children: React.ReactNode;
  }) => (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 24,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color,
          letterSpacing: 0.5,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {icon} {title}
      </div>
      {children}
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e17",
        color: "#e2e8f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)",
          padding: "28px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link
            href={`/?season=${season}`}
            style={{
              color: "rgba(255,255,255,0.4)",
              textDecoration: "none",
              fontSize: 13,
              marginBottom: 16,
              display: "block",
            }}
          >
            {lang === "ko" ? "← 대시보드로 돌아가기" : "← Back to Dashboard"}
          </Link>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
                🏟️ {lang === "ko" ? "팀 전체 AI 분석" : "Team AI Analysis"}
              </h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "6px 0 0 0" }}>
                {lang === "ko" ? "AI가 팀 전체 성적을 종합적으로 분석합니다" : "AI analyzes the entire team performance"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {seasons.map((s) => (
                <button
                  key={s}
                  onClick={() => changeSeason(s)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "none",
                    background: season === s ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
                    color: season === s ? "#60a5fa" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {!report && !loading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏟️</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
              {lang === "ko" ? `${season} 시즌 팀 전체를 AI가 분석합니다` : `AI will analyze the full team for ${season} season`}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginBottom: 28 }}>
              {lang === "ko"
                ? "팀 타격/투구 분석, 핵심 선수, 강점/약점, 전략 제안이 포함됩니다"
                : "Includes batting/pitching analysis, key players, strengths/weaknesses, strategic recommendations"}
            </div>

            {error && <div style={{ fontSize: 14, color: "#ef4444", marginBottom: 16 }}>{error}</div>}

            <button
              onClick={analyze}
              style={{
                padding: "14px 36px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              🤖 {lang === "ko" ? "팀 분석 시작" : "Start Team Analysis"}
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: "3px solid rgba(59,130,246,0.2)",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 20px",
              }}
            />
            <div style={{ fontSize: 16, fontWeight: 600, color: "#60a5fa" }}>
              {lang === "ko" ? "AI가 팀을 분석하고 있습니다..." : "AI is analyzing the team..."}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              {lang === "ko" ? "보통 10~20초 내외" : "Usually within 10~20 seconds"}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {report && (
          <div>
            <div
              style={{
                padding: "20px 24px",
                background: "rgba(59,130,246,0.06)",
                borderLeft: "4px solid #3b82f6",
                borderRadius: "0 14px 14px 0",
                fontSize: 15,
                color: "#cbd5e1",
                lineHeight: 1.8,
                marginBottom: 24,
              }}
            >
              {report.overview}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Section icon="⚾" title={lang === "ko" ? "타격 분석" : "Batting Analysis"} color="#22c55e">
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
                  {report.batting_analysis}
                </div>
              </Section>

              <Section icon="🏏" title={lang === "ko" ? "투구 분석" : "Pitching Analysis"} color="#60a5fa">
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
                  {report.pitching_analysis}
                </div>
              </Section>
            </div>

            <Section icon="⭐" title={lang === "ko" ? "핵심 선수" : "Top Performers"} color="#eab308">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.top_performers?.map((p: string, i: number) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: "rgba(234,179,8,0.04)",
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background:
                          i === 0
                            ? "linear-gradient(135deg, #eab308, #ca8a04)"
                            : i === 1
                            ? "linear-gradient(135deg, #94a3b8, #64748b)"
                            : "linear-gradient(135deg, #b45309, #92400e)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{p}</div>
                  </div>
                ))}
              </div>
            </Section>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <Section icon="💪" title={lang === "ko" ? "팀 강점" : "Team Strengths"} color="#22c55e">
                {report.team_strengths?.map((s: string, i: number) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.65)",
                      lineHeight: 1.8,
                      paddingLeft: 14,
                    }}
                  >
                    · {s}
                  </div>
                ))}
              </Section>

              <Section icon="⚡" title={lang === "ko" ? "개선 필요 영역" : "Areas to Improve"} color="#f97316">
                {report.team_weaknesses?.map((s: string, i: number) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.65)",
                      lineHeight: 1.8,
                      paddingLeft: 14,
                    }}
                  >
                    · {s}
                  </div>
                ))}
              </Section>
            </div>

            <Section icon="📋" title={lang === "ko" ? "전략 제안" : "Strategic Recommendations"} color="#a78bfa">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.strategic_recommendations?.map((s: string, i: number) => (
                  <div
                    key={i}
                    style={{
                      padding: "12px 16px",
                      background: "rgba(167,139,250,0.04)",
                      borderRadius: 10,
                      borderLeft: "3px solid rgba(167,139,250,0.3)",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.7,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#a78bfa", marginRight: 8 }}>{i + 1}.</span>
                    {s}
                  </div>
                ))}
              </div>
            </Section>

            <Section icon="🎯" title={lang === "ko" ? "경기 운영 팁" : "Game Strategy Tips"} color="#ef4444">
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
                {report.key_matchup_tips}
              </div>
            </Section>

            <div style={{ textAlign: "center", paddingTop: 16 }}>
              <button
                onClick={analyze}
                disabled={loading}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: "rgba(255,255,255,0.06)",
                  color: "#60a5fa",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🔄 {lang === "ko" ? "재분석" : "Re-analyze"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
