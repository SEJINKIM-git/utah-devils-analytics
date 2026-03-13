import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import LangToggle from "@/app/components/LangToggle";
import LineupSimulator from "@/app/components/LineupSimulator";
import SeasonFilter from "@/app/components/SeasonFilter";
import { ACTIVE_SEASON_COOKIE, normalizeSelectedSeason, sortSeasons } from "@/lib/season";
import { Lang } from "@/lib/translations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LineupPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  const params = await searchParams;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value || "ko") as Lang;
  const preferredSeason = cookieStore.get(ACTIVE_SEASON_COOKIE)?.value;

  const { data: rawPlayers } = await supabase.from("players").select("*").order("number");
  const { data: allBattingRaw } = await supabase.from("batting_stats").select("season");
  const { data: allPitchingRaw } = await supabase.from("pitching_stats").select("season");
  const sortedSeasons = sortSeasons([
    ...(allBattingRaw || []).map((b: any) => b.season),
    ...(allPitchingRaw || []).map((p: any) => p.season),
    preferredSeason,
  ]);
  const seasons = sortedSeasons.length > 0 ? sortedSeasons : [preferredSeason || "2026"];
  const selectedSeason = normalizeSelectedSeason(params.season, seasons, preferredSeason || "2026", preferredSeason);
  const { data: batting } = await supabase.from("batting_stats").select("*").eq("season", selectedSeason);

  let lineups: any[] = [];
  try {
    const { data } = await supabase
      .from("lineups")
      .select("*")
      .eq("season", selectedSeason)
      .order("created_at", { ascending: false });
    if (data) lineups = data;
  } catch (e) {}

  // 등번호(number) 기준 중복 제거 — DB에 같은 선수가 다른 id로 중복 저장된 경우 방어
  // 같은 등번호 선수는 가장 최근 id(큰 값) 기준으로 대표 선수 선택
  const uniquePlayers = Array.from(
    (rawPlayers || []).reduce((map: Map<number, any>, p: any) => {
      const existing = map.get(p.number);
      if (!existing || p.id > existing.id) map.set(p.number, p);
      return map;
    }, new Map<number, any>()).values()
  );

  // 등번호 → 대표 player_id 매핑 (중복 id들도 모두 같은 선수로 합산)
  const numberToPlayerId = new Map<number, number>();
  for (const p of (rawPlayers || [])) {
    const rep = uniquePlayers.find((u: any) => u.number === (p as any).number);
    if (rep) numberToPlayerId.set((p as any).id, (rep as any).id);
  }

  // 타자 기록 — 중복 id 포함 모두 대표 id로 합산
  const battingMap = new Map<number, any>();
  for (const b of batting || []) {
    const repId: number = numberToPlayerId.get(b.player_id) ?? b.player_id;
    if (battingMap.has(repId)) {
      const acc = battingMap.get(repId);
      battingMap.set(repId, {
        ...acc,
        pa: acc.pa + (b.pa||0), ab: acc.ab + (b.ab||0),
        hits: acc.hits + (b.hits||0), doubles: acc.doubles + (b.doubles||0),
        triples: acc.triples + (b.triples||0), hr: acc.hr + (b.hr||0),
        bb: acc.bb + (b.bb||0), hbp: acc.hbp + (b.hbp||0),
      });
    } else { battingMap.set(repId, { ...b }); }
  }
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
              <Link href={`/?season=${selectedSeason}`} style={{ textDecoration: "none" }}>
                <Image src="/logos/cap-logo.png" alt="Utah Devils" width={42} height={42} style={{ borderRadius: 12 }} />
              </Link>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                {lang === "ko" ? `라인업 시뮬레이터 · ${selectedSeason}` : `Lineup Simulator · ${selectedSeason}`}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "← 대시보드" : "← Dashboard"}
              </Link>
              <Link href={`/schedule?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(34,197,94,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "📅 일정" : "📅 Schedule"}
              </Link>
              <Link href={`/team-analysis?season=${selectedSeason}`} style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(59,130,246,0.12)", color: "#60a5fa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                {lang === "ko" ? "🤖 팀 분석" : "🤖 Analysis"}
              </Link>
              <LangToggle lang={lang} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SeasonFilter seasons={seasons} basePath="/lineup" />
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <LineupSimulator players={playersWithStats} savedLineups={lineups} lang={lang} season={selectedSeason} />
      </div>
    </div>
  );
}
