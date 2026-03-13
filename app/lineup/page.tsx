import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/app/components/LangToggle";
import LineupSimulator from "@/app/components/LineupSimulator";
import { Lang } from "@/lib/translations";

export default async function LineupPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;

  const { data: players } = await supabase.from("players").select("*").order("number");
  const { data: allBattingRaw } = await supabase.from("batting_stats").select("season");
  const seasons = [...new Set((allBattingRaw || []).map((b: any) => b.season).filter(Boolean))].sort().reverse();
  const latestSeason = (seasons[0] as string) || "2026";
  const { data: batting } = await supabase.from("batting_stats").select("*").eq("season", latestSeason);

  let lineups: any[] = [];
  try {
    const { data } = await supabase.from("lineups").select("*").order("created_at", { ascending: false });
    if (data) lineups = data;
  } catch (e) {}

  // 타자 기록 누적합산
  const battingMap = new Map<number, any>();
  for (const b of batting || []) {
    if (battingMap.has(b.player_id)) {
      const acc = battingMap.get(b.player_id);
      battingMap.set(b.player_id, {
        ...acc,
        pa: acc.pa + (b.pa||0), ab: acc.ab + (b.ab||0),
        hits: acc.hits + (b.hits||0), doubles: acc.doubles + (b.doubles||0),
        triples: acc.triples + (b.triples||0), hr: acc.hr + (b.hr||0),
        bb: acc.bb + (b.bb||0), hbp: acc.hbp + (b.hbp||0),
      });
    } else { battingMap.set(b.player_id, { ...b }); }
  }

  // id 기준 중복 제거
  const uniquePlayers = Array.from(
    new Map((players || []).map((p) => [p.id, p])).values()
  );
  const playersWithStats = uniquePlayers.map((p) => {
    const b = battingMap.get(p.id);
    const avg = b && b.ab > 0 ? (b.hits / b.ab).toFixed(3) : "---";
    const obp = b && b.pa > 0 ? ((b.hits + b.bb + b.hbp) / b.pa).toFixed(3) : "---";
    const slg = b && b.ab > 0 ? ((b.hits - b.doubles - b.triples - b.hr + b.doubles * 2 + b.triples * 3 + b.hr * 4) / b.ab).toFixed(3) : "---";
    const ops = obp !== "---" && slg !== "---" ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : "---";
    return { ...p, avg, obp, slg, ops, pa: b?.pa || 0, hits: b?.hits || 0 };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0E1428", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #141B3D 0%, #0E1428 100%)", padding: "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Link href="/" style={{ textDecoration: "none" }}>
                <Image src="/logos/cap-logo.png" alt="Utah Devils" width={42} height={42} style={{ borderRadius: 12 }} />
              </Link>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                {lang === "ko" ? "라인업 시뮬레이터" : "Lineup Simulator"}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/" style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "← 대시보드" : "← Dashboard"}
              </Link>
              <Link href="/schedule" style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(34,197,94,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "📅 일정" : "📅 Schedule"}
              </Link>
              <LangToggle lang={lang} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <LineupSimulator players={playersWithStats} savedLineups={lineups} lang={lang} />
      </div>
    </div>
  );
}