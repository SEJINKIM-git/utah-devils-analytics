import AIButton from "@/app/components/AIButton";
import SeasonChart from "@/app/components/SeasonChart";
import PlayerGoals from "@/app/components/PlayerGoals";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import { t, Lang } from "@/lib/translations";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function PlayerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;

  const { data: player } = await supabase.from("players").select("*").eq("id", id).single();
  if (!player) {
    return <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t("player.notFound", lang)}</div>;
  }

  const { data: allBatting } = await supabase.from("batting_stats").select("*").eq("player_id", id);
  const { data: allPitching } = await supabase.from("pitching_stats").select("*").eq("player_id", id);
  const { data: reports } = await supabase.from("ai_reports").select("*").eq("player_id", id).order("generated_at", { ascending: false }).limit(1);

  // 최신 시즌 기록 전체 합산
  const latestBatSeason = allBatting?.filter(b => b.season !== "Career").sort((a, b) => (b.season || "").localeCompare(a.season || ""))?.[0]?.season;
  const latestPitSeason = allPitching?.filter(p => p.season !== "Career" && p.ip > 0).sort((a, b) => (b.season || "").localeCompare(a.season || ""))?.[0]?.season;

  const batRecords = allBatting?.filter(b => b.season === latestBatSeason) || [];
  const pitRecords = allPitching?.filter(p => p.season === latestPitSeason && p.ip > 0) || [];

  const bat = batRecords.length > 0 ? batRecords.reduce((acc, b) => ({
    ...acc,
    pa: acc.pa + (b.pa || 0), ab: acc.ab + (b.ab || 0), runs: acc.runs + (b.runs || 0),
    hits: acc.hits + (b.hits || 0), doubles: acc.doubles + (b.doubles || 0),
    triples: acc.triples + (b.triples || 0), hr: acc.hr + (b.hr || 0),
    rbi: acc.rbi + (b.rbi || 0), bb: acc.bb + (b.bb || 0), hbp: acc.hbp + (b.hbp || 0),
    so: acc.so + (b.so || 0), sb: acc.sb + (b.sb || 0),
  }), { ...batRecords[0], pa:0, ab:0, runs:0, hits:0, doubles:0, triples:0, hr:0, rbi:0, bb:0, hbp:0, so:0, sb:0 }) : null;

  const pitch = pitRecords.length > 0 ? pitRecords.reduce((acc, p) => ({
    ...acc,
    w: acc.w + (p.w || 0), l: acc.l + (p.l || 0), sv: acc.sv + (p.sv || 0),
    hld: acc.hld + (p.hld || 0),
    ip: (parseFloat(String(acc.ip)) || 0) + (parseFloat(String(p.ip)) || 0),
    ha: acc.ha + (p.ha || 0), runs_allowed: acc.runs_allowed + (p.runs_allowed || 0),
    er: acc.er + (p.er || 0), bb: acc.bb + (p.bb || 0), hbp: acc.hbp + (p.hbp || 0),
    so: acc.so + (p.so || 0), hr_allowed: acc.hr_allowed + (p.hr_allowed || 0),
  }), { ...pitRecords[0], w:0, l:0, sv:0, hld:0, ip:0, ha:0, runs_allowed:0, er:0, bb:0, hbp:0, so:0, hr_allowed:0 }) : null;

  const report = reports?.[0];

  const avg = bat && bat.ab > 0 ? (bat.hits / bat.ab).toFixed(3) : "---";
  const obp = bat && bat.pa > 0 ? ((bat.hits + bat.bb + bat.hbp) / bat.pa).toFixed(3) : "---";
  const slg = bat && bat.ab > 0 ? ((bat.hits - bat.doubles - bat.triples - bat.hr + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4) / bat.ab).toFixed(3) : "---";
  const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
  const opsNum = parseFloat(ops) || 0;
  const era = pitch && pitch.ip > 0 ? ((pitch.er / pitch.ip) * 5).toFixed(2) : null;
  const whip = pitch && pitch.ip > 0 ? ((pitch.ha + pitch.bb) / pitch.ip).toFixed(2) : null;

  const getOpsGrade = (v: number) => {
    if (v >= 1.0) return { grade: "A+", color: "#22c55e", label: t("grade.elite", lang) };
    if (v >= 0.85) return { grade: "A", color: "#22c55e", label: t("grade.allstar", lang) };
    if (v >= 0.7) return { grade: "B", color: "#eab308", label: t("grade.aboveAvg", lang) };
    if (v >= 0.5) return { grade: "C", color: "#f97316", label: t("grade.belowAvg", lang) };
    return { grade: "D", color: "#ef4444", label: t("grade.needsWork", lang) };
  };
  const getEraGrade = (v: number) => {
    if (v <= 2.5) return { grade: "A+", color: "#22c55e", label: t("grade.ace", lang) };
    if (v <= 3.5) return { grade: "A", color: "#22c55e", label: t("grade.excellent", lang) };
    if (v <= 5.0) return { grade: "B", color: "#eab308", label: t("grade.average", lang) };
    if (v <= 7.0) return { grade: "C", color: "#f97316", label: t("grade.unstable", lang) };
    return { grade: "D", color: "#ef4444", label: t("grade.needsWork", lang) };
  };
  const opsGrade = getOpsGrade(opsNum);
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (lang === "en") return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };
  const latestSeason = latestBatSeason || latestPitSeason || "2026";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b3a 100%)", padding: "28px 40px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16, display: "block" }}>{t("nav.back", lang)}</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg, #dc2626, #991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: "#fff" }}>{player.number}</div>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{player.name}</h1>
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(96,165,250,0.12)", color: "#60a5fa", fontWeight: 600 }}>#{player.number}</span>
                {player.is_pitcher && <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(234,179,8,0.12)", color: "#eab308", fontWeight: 600 }}>{t("player.pitcher", lang)}</span>}
                <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{latestSeason} {t("site.season", lang)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {/* 타격 기록 */}
        {bat && (<>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>{t("player.battingRecord", lang)}</h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px", flex: 1, display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: opsGrade.color + "15", border: "2px solid " + opsGrade.color + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: opsGrade.color }}>{opsGrade.grade}</div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 1 }}>OPS {lang === "ko" ? "등급" : "Grade"}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: opsGrade.color, lineHeight: 1.1 }}>{ops}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{opsGrade.label}</div>
              </div>
            </div>
            {[
              { label: t("batting.avg", lang), value: avg, color: parseFloat(avg) >= 0.3 ? "#22c55e" : parseFloat(avg) >= 0.2 ? "#eab308" : "#ef4444" },
              { label: t("batting.obp", lang), value: obp, color: "#60a5fa" },
              { label: t("batting.slg", lang), value: slg, color: "#a78bfa" },
            ].map((stat, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px", textAlign: "center" as const, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 8 }}>{stat.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 40 }}>
            {[
              { label: t("batting.pa", lang), value: bat.pa }, { label: t("batting.ab", lang), value: bat.ab },
              { label: t("batting.h", lang), value: bat.hits, color: bat.hits >= 5 ? "#22c55e" : undefined },
              { label: t("batting.doubles", lang), value: bat.doubles }, { label: t("batting.triples", lang), value: bat.triples },
              { label: t("batting.hr", lang), value: bat.hr, color: bat.hr > 0 ? "#eab308" : undefined },
              { label: t("batting.rbi", lang), value: bat.rbi }, { label: t("batting.runs", lang), value: bat.runs },
              { label: t("batting.bb", lang), value: bat.bb, color: bat.bb >= 10 ? "#60a5fa" : undefined },
              { label: t("batting.hbp", lang), value: bat.hbp },
              { label: t("batting.so", lang), value: bat.so, color: bat.so >= 8 ? "#ef4444" : undefined },
              { label: t("batting.sb", lang), value: bat.sb, color: bat.sb >= 6 ? "#a78bfa" : undefined },
            ].map((stat, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "14px 12px", textAlign: "center" as const }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: stat.color || "#e2e8f0" }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </>)}

        {/* 투수 기록 */}
        {pitch && pitch.ip > 0 && (() => {
          const eraNum = parseFloat(era || "0");
          const eraGrade = getEraGrade(eraNum);
          return (<>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t("player.pitchingRecord", lang)}</h2>
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px", flex: 1, display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: eraGrade.color + "15", border: "2px solid " + eraGrade.color + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: eraGrade.color }}>{eraGrade.grade}</div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 1 }}>ERA {lang === "ko" ? "등급" : "Grade"}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: eraGrade.color, lineHeight: 1.1 }}>{era}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{eraGrade.label}</div>
                </div>
              </div>
              {[
                { label: "WHIP", value: whip, color: parseFloat(whip || "0") <= 3.0 ? "#22c55e" : "#f97316" },
                { label: t("pitching.wl", lang), value: pitch.w + "-" + pitch.l, color: pitch.w > pitch.l ? "#22c55e" : "#ef4444" },
                { label: t("pitching.save", lang), value: pitch.sv, color: pitch.sv > 0 ? "#eab308" : "rgba(255,255,255,0.4)" },
              ].map((stat, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px 28px", textAlign: "center" as const, minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 40 }}>
              {[
                { label: t("pitching.ip", lang), value: pitch.ip }, { label: t("pitching.ha", lang), value: pitch.ha },
                { label: t("pitching.ra", lang), value: pitch.runs_allowed }, { label: t("pitching.er", lang), value: pitch.er },
                { label: t("pitching.bb", lang), value: pitch.bb, color: pitch.bb >= 10 ? "#ef4444" : undefined },
                { label: t("pitching.so", lang), value: pitch.so, color: pitch.so >= 10 ? "#22c55e" : undefined },
                { label: t("pitching.hra", lang), value: pitch.hr_allowed },
              ].map((stat, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "14px 12px", textAlign: "center" as const }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 6 }}>{stat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: stat.color || "#e2e8f0" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </>);
        })()}

        {/* 🎯 개인 목표 달성도 */}
        <PlayerGoals playerId={player.id} isPitcher={player.is_pitcher} lang={lang} />

        {/* 📈 시즌 성장 그래프 */}
        <SeasonChart batting={allBatting || []} pitching={allPitching || []} lang={lang} />

        {/* AI 분석 리포트 */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>AI</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t("ai.title", lang)}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>#{player.number} {player.name}</div>
              </div>
            </div>
            {report && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "right" as const }}>{t("ai.lastAnalysis", lang)}: {formatDate(report.generated_at)}</div>}
          </div>
          {report ? (
            <div>
              <div style={{ padding: "14px 16px", background: "rgba(59,130,246,0.08)", borderLeft: "3px solid #3b82f6", borderRadius: "0 10px 10px 0", fontSize: 14, color: "#cbd5e1", lineHeight: 1.7, marginBottom: 20 }}>{report.summary}</div>
              {report.strengths && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: 1, marginBottom: 8 }}>{t("ai.strengths", lang)}</div>{JSON.parse(report.strengths).map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.8, paddingLeft: 14 }}>· {s}</div>)}</div>}
              {report.improvements && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: 1, marginBottom: 8 }}>{t("ai.improvements", lang)}</div>{JSON.parse(report.improvements).map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.8, paddingLeft: 14 }}>· {s}</div>)}</div>}
              {report.training_plan && <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", letterSpacing: 1, marginBottom: 8 }}>{t("ai.trainingPlan", lang)}</div><div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.8, padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>{report.training_plan}</div></div>}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}><AIButton playerId={player.id} hasReport={true} lang={lang} /></div>
            </div>
          ) : (
            <AIButton playerId={player.id} lang={lang} />
          )}
        </div>
      </div>
    </div>
  );
}